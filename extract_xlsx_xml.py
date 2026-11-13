#!/usr/bin/env python3
import zipfile
import xml.etree.ElementTree as ET
from pathlib import Path

excel_path = Path(__file__).parent / 'csv' / '[FINAL] TrustPrompt_Curated_Dataset.xlsx'

print(f"Excel path: {excel_path}")
print(f"File exists: {excel_path.exists()}\n")

if not excel_path.exists():
    print("File not found!")
    exit(1)

# Open as ZIP
print("Opening Excel file as ZIP archive...")
with zipfile.ZipFile(excel_path, 'r') as zip_ref:
    # List files in the archive
    files = zip_ref.namelist()
    print(f"Files in archive: {len(files)}\n")
    
    # Get sheet names from workbook.xml
    print("Reading workbook.xml...")
    workbook_xml = zip_ref.read('xl/workbook.xml').decode('utf-8')
    root = ET.fromstring(workbook_xml)
    
    # Extract sheet names
    sheets_elem = root.find('.//{http://schemas.openxmlformats.org/spreadsheetml/2006/main}sheets')
    sheet_names = []
    
    if sheets_elem is not None:
        for sheet in sheets_elem.findall('{http://schemas.openxmlformats.org/spreadsheetml/2006/main}sheet'):
            sheet_names.append(sheet.get('name'))
    
    print(f"Sheet names ({len(sheet_names)} total):")
    for i, name in enumerate(sheet_names, 1):
        print(f"  {i}. {name}")
    
    print("\n" + "="*70 + "\n")
    
    # Process each sheet
    for sheet_idx, sheet_name in enumerate(sheet_names, 1):
        print(f"📄 SHEET: \"{sheet_name}\"")
        print("─" * 70)
        
        # Read sheet XML
        sheet_file = f'xl/worksheets/sheet{sheet_idx}.xml'
        if sheet_file not in files:
            print("(Sheet file not found)")
            continue
        
        sheet_xml = zip_ref.read(sheet_file).decode('utf-8')
        sheet_root = ET.fromstring(sheet_xml)
        
        # Get namespace
        ns = {'ss': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
        
        # Get dimensions
        dims = sheet_root.find('.//ss:dimension', ns)
        if dims is not None:
            print(f"Dimensions: {dims.get('ref')}")
        
        # Get rows
        rows = sheet_root.findall('.//ss:row', ns)
        print(f"Total rows with data: {len(rows)}")
        
        # Extract data from first few rows
        print(f"\nFirst 5 rows (showing first 10 columns):")
        print("─" * 70)
        
        for row_idx, row in enumerate(rows[:5]):
            cells = row.findall('ss:c', ns)
            row_data = []
            for cell in cells[:10]:
                value_elem = cell.find('ss:v', ns)
                text_elem = cell.find('ss:t', ns)
                
                if value_elem is not None and value_elem.text:
                    row_data.append(value_elem.text)
                elif text_elem is not None and text_elem.text:
                    row_data.append(text_elem.text)
                else:
                    row_data.append("")
            
            print(f"\nRow {row_idx + 1}:")
            for col_idx, val in enumerate(row_data, 1):
                if val:
                    display = val[:80] + "..." if len(val) > 80 else val
                    print(f"  Col {col_idx}: {display}")
    
    print("\n" + "="*70)
    print("\n✅ Analysis complete!")
