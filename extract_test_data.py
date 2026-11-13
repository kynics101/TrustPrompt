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

# Keep track of the test sheets we care about
test_sheets = ['Path A Tests', 'Path B Tests', 'Path C Tests', 'Multi-Path Tests']

# Open as ZIP
with zipfile.ZipFile(excel_path, 'r') as zip_ref:
    # Get sheet names from workbook.xml
    workbook_xml = zip_ref.read('xl/workbook.xml').decode('utf-8')
    root = ET.fromstring(workbook_xml)
    
    # Extract sheet names
    sheets_elem = root.find('.//{http://schemas.openxmlformats.org/spreadsheetml/2006/main}sheets')
    sheet_names = []
    sheet_ids = {}
    
    if sheets_elem is not None:
        for sheet in sheets_elem.findall('{http://schemas.openxmlformats.org/spreadsheetml/2006/main}sheet'):
            name = sheet.get('name')
            rel_id = sheet.get('{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id')
            sheet_names.append(name)
            sheet_ids[name] = rel_id
    
    print(f"Total sheets: {len(sheet_names)}")
    print(f"Sheet names: {sheet_names}\n")
    
    # Get relationships to find sheet file mapping
    rels_xml = zip_ref.read('xl/_rels/workbook.xml.rels').decode('utf-8')
    rels_root = ET.fromstring(rels_xml)
    
    sheet_files = {}
    for rel in rels_root.findall('{http://schemas.openxmlformats.org/package/2006/relationships}Relationship'):
        rel_id = rel.get('Id')
        target = rel.get('Target')
        if target and target.startswith('worksheets/sheet'):
            sheet_files[rel_id] = target
    
    print("="*80)
    print("TEST SHEETS ANALYSIS")
    print("="*80 + "\n")
    
    # Process each test sheet
    for sheet_name in sheet_names:
        if 'Test' not in sheet_name:
            continue
        
        print(f"\n📄 SHEET: \"{sheet_name}\"")
        print("─" * 80)
        
        # Find the sheet file
        if sheet_name not in sheet_ids or sheet_ids[sheet_name] not in sheet_files:
            print("(Could not find sheet file)")
            continue
        
        sheet_file = 'xl/' + sheet_files[sheet_ids[sheet_name]]
        
        if sheet_file not in zip_ref.namelist():
            print(f"(Sheet file {sheet_file} not found)")
            continue
        
        # Read sheet XML
        sheet_xml = zip_ref.read(sheet_file).decode('utf-8')
        sheet_root = ET.fromstring(sheet_xml)
        
        # Get namespace
        ns = {'ss': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
        
        # Get dimensions
        dims = sheet_root.find('.//ss:dimension', ns)
        if dims is not None:
            dims_str = dims.get('ref')
            print(f"Dimensions: {dims_str}")
            # Parse dimensions like "A1:AU92" to get row and column count
            if dims_str and ':' in dims_str:
                parts = dims_str.split(':')
                end_ref = parts[1]
                # Extract column letter and row number
                import re
                match = re.match(r'([A-Z]+)(\d+)', end_ref)
                if match:
                    col_letters = match.group(1)
                    row_num = int(match.group(2))
                    
                    # Convert column letters to number
                    col_num = 0
                    for c in col_letters:
                        col_num = col_num * 26 + (ord(c) - ord('A') + 1)
                    
                    print(f"Total columns: {col_num}")
                    print(f"Total rows: {row_num} (including header)")
        
        # Get rows and extract headers
        rows = sheet_root.findall('.//ss:row', ns)
        print(f"Rows with data: {len(rows)}")
        
        # Extract values from all rows, handling merged cells and shared strings
        def get_cell_value(cell, ns, zip_ref):
            """Extract value from a cell"""
            # Check if it's a shared string reference
            t = cell.get('t')
            value_elem = cell.find('ss:v', ns)
            
            if value_elem is None:
                return ""
            
            value = value_elem.text or ""
            
            if t == 's':
                # It's a shared string, convert to int and look up
                try:
                    str_idx = int(value)
                    # Load shared strings
                    if not hasattr(get_cell_value, 'shared_strings'):
                        strings_xml = zip_ref.read('xl/sharedStrings.xml').decode('utf-8')
                        strings_root = ET.fromstring(strings_xml)
                        get_cell_value.shared_strings = []
                        for si in strings_root.findall('.//ss:si', ns):
                            t_elem = si.find('ss:t', ns)
                            if t_elem is not None and t_elem.text:
                                get_cell_value.shared_strings.append(t_elem.text)
                    
                    if str_idx < len(get_cell_value.shared_strings):
                        return get_cell_value.shared_strings[str_idx]
                except:
                    pass
            
            return value
        
        # Clear shared strings cache
        get_cell_value.shared_strings = None
        
        # Show first 10 rows with all columns
        print(f"\nFirst 10 rows (all columns):")
        print("─" * 80)
        
        for row_idx, row in enumerate(rows[:10]):
            cells = row.findall('ss:c', ns)
            row_data = []
            for cell in cells:
                val = get_cell_value(cell, ns, zip_ref)
                row_data.append(val)
            
            if row_idx == 0:
                print(f"\nColumn Headers ({len(row_data)} columns):")
                for col_idx, val in enumerate(row_data, 1):
                    if val:
                        print(f"  Col {col_idx}: {val}")
            else:
                print(f"\nRow {row_idx}:")
                for col_idx, val in enumerate(row_data[:15], 1):  # Show first 15 columns
                    if val:
                        display = val[:100] + "..." if len(val) > 100 else val
                        print(f"  Col {col_idx}: {display}")

print("\n" + "="*80)
print("✅ Analysis complete!")
