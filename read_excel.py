import openpyxl
import json
import os
from pathlib import Path

excel_path = Path(__file__).parent / 'csv' / '[FINAL] TrustPrompt_Curated_Dataset.xlsx'

print(f"Excel path: {excel_path}")
print(f"File exists: {excel_path.exists()}")
print(f"File size: {excel_path.stat().st_size if excel_path.exists() else 'N/A'} bytes")

print("\n" + "="*70)
print("EXCEL FILE ANALYSIS")
print("="*70 + "\n")

# Load workbook
try:
    print("Loading workbook...")
    wb = openpyxl.load_workbook(str(excel_path), data_only=True)
    print(f"✓ Loaded successfully\n")
except Exception as e:
    print(f"✗ Error loading workbook: {e}")
    exit(1)

# List sheet names
print(f"Sheet names ({len(wb.sheetnames)} total):")
for i, name in enumerate(wb.sheetnames, 1):
    print(f"  {i}. {name}")

print("\n" + "="*70 + "\n")

# Analyze each sheet
for sheet_name in wb.sheetnames:
    print(f"\n📄 SHEET: \"{sheet_name}\"")
    print("─" * 70)
    
    ws = wb[sheet_name]
    
    # Get dimensions
    if ws.max_row == 0:
        print("(Empty sheet)")
        continue
    
    # Extract headers
    headers = []
    for cell in ws[1]:
        headers.append(cell.value)
    
    print(f"Total rows: {ws.max_row - 1}")  # Minus header
    print(f"Total columns: {len([h for h in headers if h is not None])}")
    
    print(f"\nColumn headers:")
    for i, header in enumerate(headers, 1):
        if header is not None:
            print(f"  {i}. {header}")
    
    # Show first 5 data rows
    print(f"\nFirst 5 rows of data:")
    print("─" * 70)
    
    row_count = 0
    for row_idx, row in enumerate(ws.iter_rows(min_row=2, values_only=True), start=1):
        if row_idx > 5:
            break
        print(f"\nRow {row_idx}:")
        for col_idx, (header, value) in enumerate(zip(headers, row)):
            if header is not None:
                if value is None:
                    display = "(empty)"
                elif isinstance(value, str) and len(value) > 100:
                    display = value[:100] + "..."
                else:
                    display = str(value)
                print(f"  {header}: {display}")
    
    # Check if this looks like test data
    if 'test' in sheet_name.lower() or 'path' in sheet_name.lower():
        print(f"\n⭐ This appears to be a TEST CASES sheet!")
        print(f"Total test cases: {ws.max_row - 1}")

print("\n" + "="*70)
print("\n✅ Analysis complete!")
