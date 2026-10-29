"""
EcoRewind 4-Class Waste Classifier Trainer
Classes:
  1. aluminium_can   (Accepted recyclable: aluminum soda cans, aluminum food cans)
  2. other_invalid   (Invalid item: glass bottles, steel cans, cardboard, food waste, etc.)
  3. plastic_bag     (Accepted recyclable: shopping bags, trash bags)
  4. plastic_bottle  (Accepted recyclable: water bottles, soda bottles, detergent bottles)

Architecture:
  - MobileNetV2 pre-trained on ImageNet
  - Domain-specific data augmentation (flips, rotations, zoom, translation, contrast, brightness)
  - Self-contained normalization layer (rescaling [0, 255] -> [-1.0, 1.0])
  - Multi-tier regularized classification head (GAP -> BN -> Dense(256) -> BN -> Dropout -> Dense(128) -> Dropout -> Softmax)
  - Two-phase training:
      Phase 1: Feature Extraction with frozen backbone (Adam lr=1e-3)
      Phase 2: Fine-Tuning top 45 convolutional layers (Adam lr=3e-5) with frozen BatchNormalization
  - Balanced class weighting
  - Independent stratified Test Set evaluation (per-class Precision, Recall, F1, Confusion Matrix, Error Analysis)
"""
import os
import sys
import json
import argparse
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import tensorflow as tf
from sklearn.metrics import classification_report, confusion_matrix
from sklearn.utils.class_weight import compute_class_weight
from tensorflow import keras
from tensorflow.keras import layers, regularizers

IMG_SIZE = 224
SEED = 42

TARGET_CLASSES = ["aluminium_can", "other_invalid", "plastic_bag", "plastic_bottle"]


def get_datasets(data_dir: Path, batch_size: int = 32):
    train_dir = data_dir / "train"
    val_dir = data_dir / "val"
    test_dir = data_dir / "test"

    train_ds = keras.utils.image_dataset_from_directory(
        train_dir,
        image_size=(IMG_SIZE, IMG_SIZE),
        batch_size=batch_size,
        label_mode="int",
        shuffle=True,
        seed=SEED,
    )

    val_ds = keras.utils.image_dataset_from_directory(
        val_dir,
        image_size=(IMG_SIZE, IMG_SIZE),
        batch_size=batch_size,
        label_mode="int",
        shuffle=False,
    )

    test_ds = keras.utils.image_dataset_from_directory(
        test_dir,
        image_size=(IMG_SIZE, IMG_SIZE),
        batch_size=batch_size,
        label_mode="int",
        shuffle=False,
    )

    class_names = train_ds.class_names
    return train_ds, val_ds, test_ds, class_names


def build_model(n_classes: int):
    # Targeted data augmentation simulating chamber camera variations
    data_augmentation = keras.Sequential(
        [
            layers.RandomFlip("horizontal"),
            layers.RandomRotation(0.12),
            layers.RandomZoom((-0.10, 0.10)),
            layers.RandomTranslation(height_factor=0.08, width_factor=0.08),
            layers.RandomContrast(0.20),
            layers.RandomBrightness(0.20),
        ],
        name="data_augmentation",
    )

    base_model = keras.applications.MobileNetV2(
        input_shape=(IMG_SIZE, IMG_SIZE, 3),
        include_top=False,
        weights="imagenet",
    )
    base_model.trainable = False

    inputs = keras.Input(shape=(IMG_SIZE, IMG_SIZE, 3), name="input_frame")
    x = data_augmentation(inputs)
    # Self-contained normalization from [0, 255] to [-1.0, 1.0]
    x = layers.Rescaling(1.0 / 127.5, offset=-1.0, name="rescaling")(x)
    x = base_model(x, training=False)
    x = layers.GlobalAveragePooling2D(name="global_pooling")(x)
    x = layers.BatchNormalization(name="bn_dense_1")(x)
    x = layers.Dense(
        256,
        activation="relu",
        kernel_regularizer=regularizers.l2(1e-4),
        name="dense_feature_256",
    )(x)
    x = layers.BatchNormalization(name="bn_dense_2")(x)
    x = layers.Dropout(0.40, name="dropout_1")(x)
    x = layers.Dense(
        128,
        activation="relu",
        kernel_regularizer=regularizers.l2(1e-4),
        name="dense_feature_128",
    )(x)
    x = layers.Dropout(0.25, name="dropout_2")(x)
    outputs = layers.Dense(n_classes, activation="softmax", name="predictions")(x)

    model = keras.Model(inputs=inputs, outputs=outputs, name="ecorewind_mobilenetv2_v2")
    return model, base_model


def plot_metrics(histories, output_path: Path):
    acc = sum([h.history.get("accuracy", []) for h in histories], [])
    val_acc = sum([h.history.get("val_accuracy", []) for h in histories], [])
    loss = sum([h.history.get("loss", []) for h in histories], [])
    val_loss = sum([h.history.get("val_loss", []) for h in histories], [])

    epochs = range(1, len(acc) + 1)
    fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(12, 4.5))

    ax1.plot(epochs, acc, "o-", label="Train Accuracy", color="#10B981")
    ax1.plot(epochs, val_acc, "s--", label="Val Accuracy", color="#3B82F6")
    ax1.set_title("EcoRewind Classifier Accuracy Across Phases", fontsize=12, fontweight="bold")
    ax1.set_xlabel("Epoch")
    ax1.set_ylabel("Accuracy")
    ax1.grid(True, linestyle="--", alpha=0.5)
    ax1.legend()

    ax2.plot(epochs, loss, "o-", label="Train Loss", color="#EF4444")
    ax2.plot(epochs, val_loss, "s--", label="Val Loss", color="#F59E0B")
    ax2.set_title("EcoRewind Cross-Entropy Loss Across Phases", fontsize=12, fontweight="bold")
    ax2.set_xlabel("Epoch")
    ax2.set_ylabel("Cross-Entropy Loss")
    ax2.grid(True, linestyle="--", alpha=0.5)
    ax2.legend()

    plt.tight_layout()
    fig.savefig(str(output_path), dpi=150)
    plt.close(fig)
    print(f"Saved training curves to: {output_path}")


def plot_confusion_matrix(cm, class_names, output_path: Path):
    fig, ax = plt.subplots(figsize=(7.5, 6.5))
    im = ax.imshow(cm, interpolation="nearest", cmap="Blues")
    ax.figure.colorbar(im, ax=ax)

    display_names = [c.replace("_", " ").title() for c in class_names]

    ax.set(
        xticks=np.arange(cm.shape[1]),
        yticks=np.arange(cm.shape[0]),
        xticklabels=display_names,
        yticklabels=display_names,
        title="EcoRewind Confusion Matrix (Independent Test Set)",
        ylabel="Actual True Class",
        xlabel="Predicted Class",
    )
    plt.setp(ax.get_xticklabels(), rotation=30, ha="right", rotation_mode="anchor")

    thresh = cm.max() / 2.0
    for i in range(cm.shape[0]):
        for j in range(cm.shape[1]):
            ax.text(
                j,
                i,
                f"{cm[i, j]:d}",
                ha="center",
                va="center",
                color="white" if cm[i, j] > thresh else "black",
                fontweight="bold",
                fontsize=11,
            )

    fig.tight_layout()
    fig.savefig(str(output_path), dpi=150)
    plt.close(fig)
    print(f"Saved confusion matrix to: {output_path}")


def main():
    parser = argparse.ArgumentParser(description="Train EcoRewind 4-Class Waste Classifier")
    parser.add_argument("--data", default="server/dataset", help="Dataset root directory")
    parser.add_argument("--out", default="server/models", help="Output directory for trained model")
    parser.add_argument("--batch", type=int, default=32, help="Batch size")
    parser.add_argument("--epochs-head", type=int, default=8, help="Epochs for training classification head")
    parser.add_argument("--epochs-finetune", type=int, default=10, help="Epochs for fine-tuning top layers")
    args = parser.parse_args()

    data_dir = Path(args.data)
    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)

    tf.keras.utils.set_random_seed(SEED)
    print(f"Loading dataset from: {data_dir.resolve()}")
    train_ds, val_ds, test_ds, class_names = get_datasets(data_dir, batch_size=args.batch)
    print(f"Detected classes: {class_names}")

    # Save labels JSON
    labels_path = out_dir / "labels.json"
    with open(labels_path, "w", encoding="utf-8") as f:
        json.dump(class_names, f, indent=2)
    print(f"Saved labels list to: {labels_path}")

    # Compute balanced class weights from training set file paths
    y_train = np.array([class_names.index(Path(p).parent.name) for p in train_ds.file_paths])
    cw = compute_class_weight("balanced", classes=np.arange(len(class_names)), y=y_train)
    class_weight = {i: float(w) for i, w in enumerate(cw)}
    print(f"Balanced class weights: {class_weight}")

    AUTOTUNE = tf.data.AUTOTUNE
    train_ds = train_ds.cache().prefetch(AUTOTUNE)
    val_ds = val_ds.cache().prefetch(AUTOTUNE)
    test_ds_pf = test_ds.prefetch(AUTOTUNE)

    # Build model
    model, base_model = build_model(len(class_names))
    model.summary()

    # --- Phase 1: Train classification head ---
    print("\n" + "=" * 60)
    print("PHASE 1: Training Classification Head (Backbone Frozen)")
    print("=" * 60)
    model.compile(
        optimizer=keras.optimizers.Adam(learning_rate=1e-3),
        loss="sparse_categorical_crossentropy",
        metrics=["accuracy"],
    )

    callbacks_phase1 = [
        keras.callbacks.EarlyStopping(
            monitor="val_accuracy",
            patience=3,
            restore_best_weights=True,
            verbose=1,
        ),
        keras.callbacks.ReduceLROnPlateau(
            monitor="val_loss",
            factor=0.5,
            patience=2,
            min_lr=1e-6,
            verbose=1,
        ),
    ]

    h1 = model.fit(
        train_ds,
        validation_data=val_ds,
        epochs=args.epochs_head,
        class_weight=class_weight,
        callbacks=callbacks_phase1,
        verbose=1,
    )

    # --- Phase 2: Fine-tune top layers of MobileNetV2 ---
    print("\n" + "=" * 60)
    print("PHASE 2: Fine-Tuning Top Convolutional Layers (Blocks 13-16)")
    print("=" * 60)
    base_model.trainable = True
    # Freeze all layers except top 45
    for layer in base_model.layers[:-45]:
        layer.trainable = False
    # Keep batch normalization layers in inference mode to avoid corrupting running stats
    for layer in base_model.layers:
        if isinstance(layer, layers.BatchNormalization):
            layer.trainable = False

    model.compile(
        optimizer=keras.optimizers.Adam(learning_rate=3e-5),
        loss="sparse_categorical_crossentropy",
        metrics=["accuracy"],
    )

    callbacks_phase2 = [
        keras.callbacks.EarlyStopping(
            monitor="val_accuracy",
            patience=4,
            restore_best_weights=True,
            verbose=1,
        ),
        keras.callbacks.ReduceLROnPlateau(
            monitor="val_loss",
            factor=0.5,
            patience=2,
            min_lr=1e-7,
            verbose=1,
        ),
    ]

    h2 = model.fit(
        train_ds,
        validation_data=val_ds,
        epochs=args.epochs_finetune,
        class_weight=class_weight,
        callbacks=callbacks_phase2,
        verbose=1,
    )

    # Plot metrics
    plot_metrics([h1, h2], out_dir / "training_curves.png")

    # --- Test Set Evaluation ---
    print("\n" + "=" * 60)
    print("EVALUATION ON INDEPENDENT TEST SET")
    print("=" * 60)
    y_true = np.concatenate([y.numpy() for _, y in test_ds_pf])
    probs = model.predict(test_ds_pf)
    y_pred = probs.argmax(axis=1)

    report_str = classification_report(y_true, y_pred, target_names=class_names, digits=3)
    report_dict = classification_report(y_true, y_pred, target_names=class_names, digits=3, output_dict=True)
    print("\n" + report_str)

    report_path = out_dir / "classification_report.txt"
    with open(report_path, "w", encoding="utf-8") as f:
        f.write(report_str)
    print(f"Saved classification report to: {report_path}")

    cm = confusion_matrix(y_true, y_pred)
    plot_confusion_matrix(cm, class_names, out_dir / "confusion_matrix.png")

    # Deep error analysis specifically between cans and bottles
    can_idx = class_names.index("aluminium_can")
    bottle_idx = class_names.index("plastic_bottle")
    invalid_idx = class_names.index("other_invalid")
    bag_idx = class_names.index("plastic_bag")

    can_as_bottle = int(cm[can_idx, bottle_idx])
    bottle_as_can = int(cm[bottle_idx, can_idx])
    invalid_accepted = int(cm[invalid_idx, can_idx] + cm[invalid_idx, bottle_idx] + cm[invalid_idx, bag_idx])
    recyclable_rejected = int(cm[can_idx, invalid_idx] + cm[bottle_idx, invalid_idx] + cm[bag_idx, invalid_idx])

    print("\n--- TARGETED METRICS ---")
    print(f"Aluminium Can misclassified as Plastic Bottle: {can_as_bottle} (out of {cm[can_idx].sum()})")
    print(f"Plastic Bottle misclassified as Aluminium Can: {bottle_as_can} (out of {cm[bottle_idx].sum()})")
    print(f"Invalid items falsely accepted: {invalid_accepted} (out of {cm[invalid_idx].sum()})")
    print(f"Valid recyclables falsely rejected: {recyclable_rejected} (out of {cm[can_idx].sum() + cm[bottle_idx].sum() + cm[bag_idx].sum()})")

    eval_summary = {
        "test_accuracy": float(report_dict["accuracy"]),
        "macro_avg_f1": float(report_dict["macro avg"]["f1-score"]),
        "weighted_avg_f1": float(report_dict["weighted avg"]["f1-score"]),
        "per_class": {
            cls: {
                "precision": float(report_dict[cls]["precision"]),
                "recall": float(report_dict[cls]["recall"]),
                "f1_score": float(report_dict[cls]["f1-score"]),
                "support": int(report_dict[cls]["support"]),
            }
            for cls in class_names
        },
        "can_as_bottle_confusion": can_as_bottle,
        "bottle_as_can_confusion": bottle_as_can,
        "invalid_falsely_accepted": invalid_accepted,
        "recyclables_falsely_rejected": recyclable_rejected,
        "confusion_matrix": cm.tolist(),
        "classes": class_names,
    }

    eval_summary_path = out_dir / "evaluation_summary.json"
    with open(eval_summary_path, "w", encoding="utf-8") as f:
        json.dump(eval_summary, f, indent=2)
    print(f"Saved evaluation summary to: {eval_summary_path}")

    # Save final model
    saved_model_path = out_dir / "ecorewind_classifier.keras"
    model.save(str(saved_model_path))
    print(f"\n[SUCCESS] Trained EcoRewind ML model saved to: {saved_model_path}")


if __name__ == "__main__":
    main()
