#!/usr/bin/env python3
"""
Export Excel test cases to JSON format for Jest automation.

This script reads the TrustPrompt Excel dataset and exports test cases to JSON,
making it easy to generate Jest test files.

Usage:
    python export-excel-to-json.py --sheet "Path A Tests" --output path-a-tests.json
    python export-excel-to-json.py --all --output all-tests.json
"""

import zipfile
import xml.etree.ElementTree as ET
from pathlib import Path
import json
import argparse
import sys

def load_shared_strings(zip_ref, ns):
    """Load shared strings from Excel workbook"""
    strings_xml = zip_ref.read('xl/sharedStrings.xml').decode('utf-8')
    strings_root = ET.fromstring(strings_xml)
    
    shared_strings = []
    for si in strings_root.findall('.//ss:si', ns):
        t_elem = si.find('ss:t', ns)
        if t_elem is not None:
            shared_strings.append(t_elem.text or "")
        else:
            text_parts = []
            for r in si.findall('ss:r', ns):
                t = r.find('ss:t', ns)
                if t is not None and t.text:
                    text_parts.append(t.text)
            shared_strings.append(''.join(text_parts))
    
    return shared_strings

def get_cell_value(cell, ns, shared_strings):
    """Extract value from a cell"""
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

def get_sheet_file_mapping(zip_ref):
    """Get mapping of sheet names to their XML files"""
    ns = {'ss': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
    
    workbook_xml = zip_ref.read('xl/workbook.xml').decode('utf-8')
    root = ET.fromstring(workbook_xml)
    
    sheets_elem = root.find('.//{http://schemas.openxmlformats.org/spreadsheetml/2006/main}sheets')
    sheet_ids = {}
    
    if sheets_elem is not None:
        for sheet in sheets_elem.findall('{http://schemas.openxmlformats.org/spreadsheetml/2006/main}sheet'):
            name = sheet.get('name')
            rel_id = sheet.get('{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id')
            sheet_ids[name] = rel_id
    
    rels_xml = zip_ref.read('xl/_rels/workbook.xml.rels').decode('utf-8')
    rels_root = ET.fromstring(rels_xml)
    
    sheet_files = {}
    for rel in rels_root.findall('{http://schemas.openxmlformats.org/package/2006/relationships}Relationship'):
        rel_id = rel.get('Id')
        target = rel.get('Target')
        if target and target.startswith('worksheets/sheet'):
            sheet_files[rel_id] = target
    
    mapping = {}
    for sheet_name, rel_id in sheet_ids.items():
        if rel_id in sheet_files:
            mapping[sheet_name] = 'xl/' + sheet_files[rel_id]
    
    return mapping

def extract_sheet_data(zip_ref, sheet_name, sheet_file, shared_strings):
    """Extract data from a sheet and return list of dictionaries"""
    ns = {'ss': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
    
    if sheet_file not in zip_ref.namelist():
        return None
    
    sheet_xml = zip_ref.read(sheet_file).decode('utf-8')
    sheet_root = ET.fromstring(sheet_xml)
    
    rows = sheet_root.findall('.//ss:row', ns)
    
    if len(rows) == 0:
        return None
    
    # Extract headers from first row
    header_cells = rows[0].findall('ss:c', ns)
    headers = []
    for cell in header_cells:
        headers.append(get_cell_value(cell, ns, shared_strings))
    
    # Extract data rows
    data = []
    for row_idx in range(1, len(rows)):
        row = rows[row_idx]
        cells = row.findall('ss:c', ns)
        row_data = {}
        
        for col_idx, (header, cell) in enumerate(zip(headers, cells)):
            if header:
                row_data[header] = get_cell_value(cell, ns, shared_strings)
        
        data.append(row_data)
    
    return {
        'sheet': sheet_name,
        'headers': headers,
        'rows': data
    }

def main():
    parser = argparse.ArgumentParser(description='Export Excel test cases to JSON')
    parser.add_argument('--sheet', help='Specific sheet to export', default=None)
    parser.add_argument('--output', help='Output JSON file', default=None)
    parser.add_argument('--all', action='store_true', help='Export all test sheets')
    parser.add_argument('--list', action='store_true', help='List all available sheets')
    
    args = parser.parse_args()
    
    excel_path = Path(__file__).parent.parent / 'csv' / '[FINAL] TrustPrompt_Curated_Dataset.xlsx'
    
    if not excel_path.exists():
        print(f"Error: Excel file not found at {excel_path}")
        sys.exit(1)
    
    ns = {'ss': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
    
    with zipfile.ZipFile(excel_path, 'r') as zip_ref:
        shared_strings = load_shared_strings(zip_ref, ns)
        sheet_mapping = get_sheet_file_mapping(zip_ref)
        
        if args.list:
            print("Available sheets:")
            for i, sheet_name in enumerate(sheet_mapping.keys(), 1):
                print(f"  {i}. {sheet_name}")
            return
        
        output_data = {}
        
        if args.all:
            for sheet_name in ['Path A Tests', 'Path B Tests', 'Path C Tests', 'Multi-Path Tests']:
                if sheet_name in sheet_mapping:
                    print(f"Extracting {sheet_name}...", file=sys.stderr)
                    sheet_data = extract_sheet_data(zip_ref, sheet_name, sheet_mapping[sheet_name], shared_strings)
                    if sheet_data:
                        output_data[sheet_name] = sheet_data
            
            output_file = args.output or 'all-test-cases.json'
        
        elif args.sheet:
            if args.sheet not in sheet_mapping:
                print(f"Error: Sheet '{args.sheet}' not found")
                sys.exit(1)
            
            print(f"Extracting {args.sheet}...", file=sys.stderr)
            sheet_data = extract_sheet_data(zip_ref, args.sheet, sheet_mapping[args.sheet], shared_strings)
            if sheet_data:
                output_data = sheet_data
            
            output_file = args.output or f"{args.sheet.lower().replace(' ', '-')}.json"
        
        else:
            parser.print_help()
            return
        
        # Write JSON
        with open(output_file, 'w', encoding='utf-8') as f:
            json.dump(output_data, f, indent=2, ensure_ascii=False)
        
        print(f"✅ Exported to {output_file}", file=sys.stderr)

if __name__ == '__main__':
    main()
