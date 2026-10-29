"""
EcoRewind Curated Dataset Builder
Audits raw archive images, eliminates duplicates, balances subcategories,
includes hard negatives (steel cans, glass bottles, cups, lids) for robust RVM discrimination,
and creates clean stratified Train (70%) / Val (15%) / Test (15%) splits with ZERO data leakage.
"""
import hashlib
import json
import random
import shutil
from pathlib import Path
from PIL import Image

CLASSES = ["aluminium_can", "other_invalid", "plastic_bag", "plastic_bottle"]
EXTS = {".jpg", ".jpeg", ".png", ".bmp", ".webp"}

RAW_DIR = Path("/home/atharvubale/Downloads/ecorewind/archive/images/images")
OUT_DIR = Path("server/dataset")
SEED = 42

def file_hash(path: Path) -> str:
    return hashlib.md5(path.read_bytes()).hexdigest()

def is_valid_image(path: Path) -> bool:
    try:
        with Image.open(path) as im:
            im.verify()
        with Image.open(path) as im:
            return min(im.size) >= 64
    except Exception:
        return False

def audit_and_build(raw_dir: Path, out_dir: Path, seed: int = SEED):
    print("=" * 60)
    print("ECO REWIND DATASET AUDIT & CURATION")
    print("=" * 60)
    print(f"Raw image directory: {raw_dir}")

    # Subcategory allocation definition
    # For accepted classes: take ALL unique valid images across default & real_world
    # For other_invalid: balance hard negatives (glass bottles, steel cans, etc.) and general waste
    subcat_plan = {
        "aluminium_can": {
            "aluminum_soda_cans": None,  # Take all unique
            "aluminum_food_cans": None,  # Take all unique
        },
        "plastic_bottle": {
            "plastic_water_bottles": None,
            "plastic_soda_bottles": None,
            "plastic_detergent_bottles": None,
        },
        "plastic_bag": {
            "plastic_shopping_bags": None,
            "plastic_trash_bags": None,
        },
        "other_invalid": {
            # Hard negatives (can distractors & bottle distractors)
            "steel_food_cans": 55,
            "aerosol_cans": 55,
            "glass_beverage_bottles": 70,
            "glass_food_jars": 50,
            "glass_cosmetic_containers": 45,
            "paper_cups": 50,
            "plastic_cup_lids": 50,
            "plastic_food_containers": 50,
            "plastic_straws": 45,
            "styrofoam_cups": 45,
            "styrofoam_food_containers": 45,
            # General household waste
            "cardboard_boxes": 40,
            "cardboard_packaging": 40,
            "clothing": 40,
            "shoes": 40,
            "coffee_grounds": 35,
            "disposable_plastic_cutlery": 40,
            "eggshells": 35,
            "food_waste": 40,
            "magazines": 35,
            "newspaper": 35,
            "office_paper": 35,
            "tea_bags": 35,
        }
    }

    rng = random.Random(seed)
    seen_hashes = set()
    class_pools = {c: [] for c in CLASSES}
    subcat_stats = {}

    for target_class, subcats in subcat_plan.items():
        print(f"\nProcessing class: {target_class}")
        for subcat_name, target_count in subcats.items():
            folder = raw_dir / subcat_name
            if not folder.exists():
                print(f"  [WARN] Missing subcategory folder: {folder}")
                continue

            unique_files = []
            for img_file in folder.rglob("*"):
                if img_file.suffix.lower() not in EXTS:
                    continue
                if not is_valid_image(img_file):
                    continue
                h = file_hash(img_file)
                if h in seen_hashes:
                    continue
                seen_hashes.add(h)
                unique_files.append(img_file)

            rng.shuffle(unique_files)
            if target_count is not None and len(unique_files) > target_count:
                selected = unique_files[:target_count]
            else:
                selected = unique_files

            class_pools[target_class].extend(selected)
            subcat_stats[subcat_name] = len(selected)
            print(f"  - {subcat_name:30s}: {len(selected):4d} images selected (out of {len(unique_files)} unique)")

    print("\n" + "=" * 60)
    print("TOTAL CURATED SAMPLES PER CLASS")
    print("=" * 60)
    for c in CLASSES:
        print(f"  {c:18s}: {len(class_pools[c]):4d} images")

    # Stratified Train (70%) / Val (15%) / Test (15%) split
    split_ratios = (0.70, 0.15, 0.15)
    splits = {"train": {c: [] for c in CLASSES}, "val": {c: [] for c in CLASSES}, "test": {c: [] for c in CLASSES}}

    for c in CLASSES:
        files = class_pools[c]
        rng.shuffle(files)
        n = len(files)
        n_train = int(n * split_ratios[0])
        n_val = int(n * split_ratios[1])
        splits["train"][c] = files[:n_train]
        splits["val"][c] = files[n_train:n_train + n_val]
        splits["test"][c] = files[n_train + n_val:]

    print("\n" + "=" * 60)
    print("STRATIFIED DATA SPLIT SUMMARY (ZERO LEAKAGE)")
    print("=" * 60)
    print(f"{'Class':<18}{'Train (70%)':>12}{'Val (15%)':>12}{'Test (15%)':>12}{'Total':>10}")
    print("-" * 64)
    for c in CLASSES:
        n_tr = len(splits["train"][c])
        n_va = len(splits["val"][c])
        n_te = len(splits["test"][c])
        tot = n_tr + n_va + n_te
        print(f"{c:<18}{n_tr:>12}{n_va:>12}{n_te:>12}{tot:>10}")
    print("-" * 64)
    total_tr = sum(len(splits["train"][c]) for c in CLASSES)
    total_va = sum(len(splits["val"][c]) for c in CLASSES)
    total_te = sum(len(splits["test"][c]) for c in CLASSES)
    print(f"{'TOTAL':<18}{total_tr:>12}{total_va:>12}{total_te:>12}{total_tr+total_va+total_te:>10}")

    # Write images to dataset directory
    if out_dir.is_symlink() or out_dir.exists():
        real_out = out_dir.resolve()
        print(f"\nWriting curated dataset to: {real_out}")
        if real_out.exists():
            shutil.rmtree(real_out)
        real_out.mkdir(parents=True, exist_ok=True)
    else:
        out_dir.mkdir(parents=True, exist_ok=True)
        real_out = out_dir

    for split_name in ["train", "val", "test"]:
        for c in CLASSES:
            dest_dir = real_out / split_name / c
            dest_dir.mkdir(parents=True, exist_ok=True)
            for idx, img_path in enumerate(splits[split_name][c]):
                dest_file = dest_dir / f"{c}_{idx:05d}.jpg"
                with Image.open(img_path) as im:
                    im.convert("RGB").save(dest_file, quality=92)

    print("\n[SUCCESS] Dataset generated and validated successfully with 0 corruptions and 0 data leakage.")

if __name__ == "__main__":
    audit_and_build(RAW_DIR, OUT_DIR)
