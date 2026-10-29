"""Model classifier module for EcoRewind live scanner."""
from __future__ import annotations

import io
import json
import base64
from pathlib import Path
from typing import Any

import numpy as np
from PIL import Image

IMG_SIZE = 224
DISPLAY_LABELS = {
    "plastic_bottle": "Plastic bottle",
    "aluminium_can": "Aluminium can",
    "plastic_bag": "Plastic bag",
    "other_invalid": "Invalid item",
}
ACCEPTED_CLASSES = {"plastic_bottle", "aluminium_can", "plastic_bag"}


class Classifier:
    def __init__(self, model_path: str | Path, labels_path: str | Path, threshold: float = 0.60):
        self.model_path = Path(model_path)
        self.labels_path = Path(labels_path)
        self.threshold = threshold
        self.ready = False
        self.detail = "Initializing..."
        self.labels: list[str] = ["aluminium_can", "other_invalid", "plastic_bag", "plastic_bottle"]
        self.model: Any = None
        self._load()

    def _load(self):
        try:
            if self.labels_path.exists():
                with open(self.labels_path, "r", encoding="utf-8") as f:
                    self.labels = json.load(f)

            if self.model_path.exists():
                from tensorflow import keras
                self.model = keras.models.load_model(self.model_path)
                self.ready = True
                self.detail = f"Model loaded from {self.model_path.name}"
                print(f"EcoRewind ML model loaded successfully: {self.model_path}")
            else:
                self.ready = False
                self.detail = f"Model file not found at {self.model_path}"
                print(self.detail)
        except Exception as e:
            self.ready = False
            self.detail = f"Error loading model: {e}"
            print(self.detail)

    def reload(self):
        """Reload updated model weights and labels."""
        self._load()

    def classify_image_bytes(self, image_bytes: bytes, custom_rates: dict[str, int] | None = None) -> dict:
        """Classify raw image bytes (JPEG/PNG/etc)."""
        if not self.ready or self.model is None:
            return {
                "decision": "rejected",
                "reason": "AI model is initializing...",
                "label": "other_invalid",
                "display_label": "AI Loading",
                "confidence": 0.0,
                "scores": {k: 0.0 for k in self.labels},
                "rate_paise_per_gram": 0,
                "rate_paise": 0,
                "key": "other_invalid",
                "valid": False,
                "model": "4-Class MobileNetV2",
            }

        try:
            im = Image.open(io.BytesIO(image_bytes)).convert("RGB")
            return self.classify_pil(im, custom_rates)
        except Exception as e:
            return {
                "decision": "rejected",
                "reason": f"Image parsing error: {e}",
                "label": "other_invalid",
                "display_label": "Invalid item",
                "confidence": 0.0,
                "scores": {k: 0.0 for k in self.labels},
                "rate_paise_per_gram": 0,
                "rate_paise": 0,
                "key": "other_invalid",
                "valid": False,
                "model": "4-Class MobileNetV2",
            }

    def classify_pil(self, pil_image: Image.Image, custom_rates: dict[str, int] | None = None) -> dict:
        im_resized = pil_image.resize((IMG_SIZE, IMG_SIZE))
        x = np.expand_dims(np.asarray(im_resized, dtype="float32"), 0)

        # Fast inference with training=False
        try:
            probs = np.asarray(self.model(x, training=False))[0]
        except Exception:
            probs = self.model.predict(x, verbose=0)[0]

        idx = int(np.argmax(probs))
        predicted_label = self.labels[idx]
        conf = float(probs[idx])

        rates_map = custom_rates or {
            "plastic_bottle": 2,
            "aluminium_can": 4,
            "plastic_bag": 1,
            "other_invalid": 0,
        }

        # Any object that is not one of the 3 accepted recyclables
        # or has low confidence is treated strictly as an Invalid Item (other_invalid).
        is_accepted = (predicted_label in ACCEPTED_CLASSES) and (conf >= self.threshold)

        if is_accepted:
            label = predicted_label
            display = DISPLAY_LABELS.get(label, label.replace("_", " ").title())
            rate = rates_map.get(label, 0)
            decision = "accepted"
            reason = f"Detected {display.lower()}"
        else:
            # Enforce invalid item for anything else or low confidence
            label = "other_invalid"
            display = "Invalid item"
            rate = 0
            decision = "rejected"
            if predicted_label not in ACCEPTED_CLASSES:
                reason = "Invalid item: item is not accepted for recycling"
            else:
                reason = f"Low confidence ({conf:.0%}). Center item in chamber."

        scores = {self.labels[k]: round(float(probs[k]), 4) for k in range(len(self.labels))}

        return {
            "decision": decision,
            "reason": reason,
            "label": label,
            "display_label": display,
            "confidence": round(conf, 4),
            "scores": scores,
            "rate_paise_per_gram": rate if is_accepted else 0,
            "rate_paise": rate if is_accepted else 0,
            "key": label,
            "valid": is_accepted,
            "model": "4-Class MobileNetV2",
        }
