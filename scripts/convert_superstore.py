import os
import pandas as pd

# ---- CONFIG ----
# Put your Excel file here (recommended):
# C:\projects\superstore_dashboard\data\Sample - Superstore.xlsx
INPUT_XLSX = os.path.join("data", "Sample - Superstore.xlsx")

# Output goes here (must be public/ so Next can fetch it):
OUT_DIR = os.path.join("public", "data")
OUT_CSV = os.path.join(OUT_DIR, "superstore_orders.csv")

def main():
    os.makedirs(OUT_DIR, exist_ok=True)

    if not os.path.exists(INPUT_XLSX):
        raise FileNotFoundError(
            f"Excel file not found at: {INPUT_XLSX}\n"
            f"Place it here: {os.path.abspath(INPUT_XLSX)}"
        )

    df = pd.read_excel(INPUT_XLSX)

    # Normalize column names (keep original Superstore ones)
    # Ensure key columns exist
    required = ["Order Date", "Ship Date", "Sales", "Profit", "Quantity", "State", "Region", "Category", "Segment"]
    missing = [c for c in required if c not in df.columns]
    if missing:
        raise ValueError(f"Missing expected columns: {missing}\nFound columns: {list(df.columns)}")

    # Parse dates
    df["Order Date"] = pd.to_datetime(df["Order Date"], errors="coerce")
    df["Ship Date"] = pd.to_datetime(df["Ship Date"], errors="coerce")

    # Add engineered fields (adds “master-level” metrics)
    df["Order Year"] = df["Order Date"].dt.year
    df["Order Month"] = df["Order Date"].dt.to_period("M").astype(str)  # e.g., "2017-11"
    df["Ship Days"] = (df["Ship Date"] - df["Order Date"]).dt.days

    # Clean numeric columns
    for col in ["Sales", "Profit", "Quantity", "Discount"]:
        if col in df.columns:
            df[col] = pd.to_numeric(df[col], errors="coerce").fillna(0)

    # Make dates ISO strings (frontend parsing becomes easy)
    df["Order Date"] = df["Order Date"].dt.strftime("%Y-%m-%d")
    df["Ship Date"] = df["Ship Date"].dt.strftime("%Y-%m-%d")

    # Drop completely empty rows
    df = df.dropna(how="all")

    df.to_csv(OUT_CSV, index=False)
    print(f"✅ CSV created: {os.path.abspath(OUT_CSV)} (rows={len(df)}, cols={df.shape[1]})")

if __name__ == "__main__":
    main()
