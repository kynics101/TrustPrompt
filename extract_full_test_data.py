#!/usr/bin/env python3
import zipfile
import xml.etree.ElementTree as ET
from pathlib import Path
import json

excel_path = Path(__file__).parent / 'csv' / '[FINAL] TrustPrompt_Curated_Dataset.xlsx'

if not excel_path.exists():
    print("File not found!")
    exit(1)

# Open as ZIP
with zipfile.ZipFile(excel_path, 'r') as zip_ref:
    # Load shared strings first
    print("Loading shared strings...")
    strings_xml = zip_ref.read('xl/sharedStrings.xml').decode('utf-8')
    strings_root = ET.fromstring(strings_xml)
    ns = {'ss': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
    
    shared_strings = []
    for si in strings_root.findall('.//ss:si', ns):
        t_elem = si.find('ss:t', ns)
        if t_elem is not None:
            shared_strings.append(t_elem.text or "")
        else:
            # Handle rich text (r elements)
            text_parts = []
            for r in si.findall('ss:r', ns):
                t = r.find('ss:t', ns)
                if t is not None and t.text:
                    text_parts.append(t.text)
            shared_strings.append(''.join(text_parts))
    
    print(f"Loaded {len(shared_strings)} shared strings\n")
    
    # Get sheet names from workbook.xml
    workbook_xml = zip_ref.read('xl/workbook.xml').decode('utf-8')
    root = ET.fromstring(workbook_xml)
    
    sheets_elem = root.find('.//{http://schemas.openxmlformats.org/spreadsheetml/2006/main}sheets')
    sheet_names = []
    sheet_ids = {}
    
    if sheets_elem is not None:
        for sheet in sheets_elem.findall('{http://schemas.openxmlformats.org/spreadsheetml/2006/main}sheet'):
            name = sheet.get('name')
            rel_id = sheet.get('{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id')
            sheet_names.append(name)
            sheet_ids[name] = rel_id
    
    # Get relationships to find sheet file mapping
    rels_xml = zip_ref.read('xl/_rels/workbook.xml.rels').decode('utf-8')
    rels_root = ET.fromstring(rels_xml)
    
    sheet_files = {}
    for rel in rels_root.findall('{http://schemas.openxmlformats.org/package/2006/relationships}Relationship'):
        rel_id = rel.get('Id')
        target = rel.get('Target')
        if target and target.startswith('worksheets/sheet'):
            sheet_files[rel_id] = target
    
    print("="*100)
    print("COMPREHENSIVE TEST SHEETS ANALYSIS")
    print("="*100 + "\n")
    
    # Process test sheets
    for sheet_name in ['Path A Tests', 'Path B Tests', 'Path C Tests', 'Multi-Path Tests']:
        if sheet_name not in sheet_ids or sheet_ids[sheet_name] not in sheet_files:
            continue
        
        print(f"\n{'='*100}")
        print(f"📄 SHEET: \"{sheet_name}\"")
        print('='*100)
        
        sheet_file = 'xl/' + sheet_files[sheet_ids[sheet_name]]
        
        if sheet_file not in zip_ref.namelist():
            continue
        
        sheet_xml = zip_ref.read(sheet_file).decode('utf-8')
        sheet_root = ET.fromstring(sheet_xml)
        
        # Get dimensions
        dims = sheet_root.find('.//ss:dimension', ns)
        if dims is not None:
            dims_str = dims.get('ref')
            if dims_str and ':' in dims_str:
                parts = dims_str.split(':')
                end_ref = parts[1]
                import re
                match = re.match(r'([A-Z]+)(\d+)', end_ref)
                if match:
                    col_letters = match.group(1)
                    row_num = int(match.group(2))
                    
                    col_num = 0
                    for c in col_letters:
                        col_num = col_num * 26 + (ord(c) - ord('A') + 1)
                    
                    print(f"\nDimensions: {dims_str}")
                    print(f"Total data rows: {row_num - 1} (excluding header)")
                    print(f"Total columns: {col_num}\n")
        
        # Get rows
        rows = sheet_root.findall('.//ss:row', ns)
        
        # Helper function to get cell value
        def get_cell_value(cell):
            t = cell.get('t')
            value_elem = cell.find('ss:v', ns)
            
            if value_elem is None or not value_elem.text:
                return ""
            
            value = value_elem.text
            
            if t == 's':
                try:
                    str_idx = int(value)
                    if str_idx < len(shared_strings):
                        return shared_strings[str_idx]
                except:
                    pass
            
            return value
        
        # Extract header row
        if len(rows) > 0:
            header_cells = rows[0].findall('ss:c', ns)
            headers = []
            for cell in header_cells:
                headers.append(get_cell_value(cell))
            
            print(f"Column Headers ({len(headers)} columns):")
            print("-" * 100)
            for idx, header in enumerate(headers, 1):
                if header:
                    print(f"  {idx}. {header}")
            
            # Show first 5 data rows with full details
            print(f"\n\nFirst 5 Data Rows (showing all non-empty columns):")
            print("-" * 100)
            
            for row_idx in range(1, min(6, len(rows))):
                row = rows[row_idx]
                cells = row.findall('ss:c', ns)
                row_data = []
                for cell in cells:
                    row_data.append(get_cell_value(cell))
                
                print(f"\nRow {row_idx}:")
                for col_idx, (header, value) in enumerate(zip(headers, row_data), 1):
                    if value:
                        display = value[:80] + "..." if len(value) > 80 else value
                        print(f"  {header}: {display}")
            
            # Summary stats for Path C and Multi-Path (which have test results)
            if sheet_name in ['Path C Tests', 'Multi-Path Tests'] and len(headers) >= 15:
                print(f"\n\nTest Result Summary:")
                print("-" * 100)
                
                # Assuming column 14 has Yes/No and column 15 has TP/FN/FP/TN
                result_col = 14  # Column index for result (0-indexed)
                status_col = 15  # Column index for status
                
                if result_col < len(headers) and status_col < len(headers):
                    results = {}
                    
                    for row_idx in range(1, len(rows)):
                        row = rows[row_idx]
                        cells = row.findall('ss:c', ns)
                        row_data = []
                        for cell in cells:
                            row_data.append(get_cell_value(cell))
                        
                        if len(row_data) > status_col:
                            status = row_data[status_col]
                            if status:
                                results[status] = results.get(status, 0) + 1
                    
                    if results:
                        print(f"Test case counts by status:")
                        for status, count in sorted(results.items()):
                            print(f"  {status}: {count}")

print(f"\n{'='*100}")
print("✅ Analysis complete!")
print(f"{'='*100}\n")
