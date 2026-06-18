import zipfile, shutil, re, io

TEMPLATE = "record_template_kyoto.xlsx"
TOTAL    = 20

shutil.copy(TEMPLATE, TEMPLATE + ".bak2")

orig_files = {}
with zipfile.ZipFile(TEMPLATE, "r") as z:
    for name in z.namelist():
        orig_files[name] = z.read(name)

PHOTO_SHEET_XML   = "xl/worksheets/sheet2.xml"
PHOTO_PRINTER_BIN = "xl/printerSettings/printerSettings2.bin"

existing_sheet_nums = [
    int(re.search(r"sheet(\d+)\.xml$", name).group(1))
    for name in orig_files
    if re.search(r"xl/worksheets/sheet\d+\.xml$", name)
]
next_sheet_num = max(existing_sheet_nums) + 1

existing_printer_nums = [
    int(re.search(r"printerSettings(\d+)\.bin$", name).group(1))
    for name in orig_files
    if re.search(r"printerSettings\d+\.bin$", name)
]
next_printer_num = (max(existing_printer_nums) + 1) if existing_printer_nums else 4

rels_xml = orig_files["xl/_rels/workbook.xml.rels"].decode("utf-8")
existing_rids = [int(m) for m in re.findall(r'Id="rId(\d+)"', rels_xml)]
next_rid = max(existing_rids) + 1

wb_xml = orig_files["xl/workbook.xml"].decode("utf-8")
existing_sheet_ids = [int(m) for m in re.findall(r'sheetId="(\d+)"', wb_xml)]
next_sheet_id = max(existing_sheet_ids) + 1

# Sheet2 を (1) にリネーム
wb_xml = re.sub(r'name="Sheet2"', 'name="(1)"', wb_xml)
orig_files["xl/workbook.xml"] = wb_xml.encode("utf-8")

new_files = {}
new_sheets = []

for i in range(2, TOTAL + 1):
    sheet_display = "(%d)" % i
    xml_path      = "xl/worksheets/sheet%d.xml" % next_sheet_num
    rels_path     = "xl/worksheets/_rels/sheet%d.xml.rels" % next_sheet_num
    printer_path  = "xl/printerSettings/printerSettings%d.bin" % next_printer_num
    rid           = "rId%d" % next_rid
    sid           = next_sheet_id

    new_files[xml_path] = orig_files[PHOTO_SHEET_XML]

    if PHOTO_PRINTER_BIN in orig_files:
        new_files[printer_path] = orig_files[PHOTO_PRINTER_BIN]
        new_rels = (
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
            '<Relationship Id="rId1" '
            'Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/printerSettings" '
            'Target="../printerSettings/printerSettings%d.bin"/>' % next_printer_num +
            '</Relationships>'
        )
        new_files[rels_path] = new_rels.encode("utf-8")
        next_printer_num += 1

    new_sheets.append((sheet_display, rid, sid, xml_path, next_sheet_num))
    next_sheet_num += 1
    next_rid += 1
    next_sheet_id += 1

wb_xml = orig_files["xl/workbook.xml"].decode("utf-8")
new_sheet_entries = "\n".join(
    '<sheet name="%s" sheetId="%d" r:id="%s"/>' % (name, sid, rid)
    for name, rid, sid, _, _ in new_sheets
)
orig_files["xl/workbook.xml"] = wb_xml.replace("</sheets>", new_sheet_entries + "</sheets>").encode("utf-8")

new_rel_entries = "\n".join(
    '<Relationship Id="%s" '
    'Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" '
    'Target="worksheets/sheet%d.xml"/>' % (rid, snum)
    for _, rid, _, _, snum in new_sheets
)
rels_updated = rels_xml.replace("</Relationships>", new_rel_entries + "</Relationships>")
orig_files["xl/_rels/workbook.xml.rels"] = rels_updated.encode("utf-8")

ct_xml = orig_files["[Content_Types].xml"].decode("utf-8")
new_ct_entries = ""
for _, _, _, xml_path, _ in new_sheets:
    new_ct_entries += (
        '<Override PartName="/%s" '
        'ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' % xml_path
    )
orig_files["[Content_Types].xml"] = ct_xml.replace("</Types>", new_ct_entries + "</Types>").encode("utf-8")

all_files = dict(list(orig_files.items()) + list(new_files.items()))
buf = io.BytesIO()
with zipfile.ZipFile(buf, "w", compression=zipfile.ZIP_DEFLATED) as zout:
    for name, data in all_files.items():
        zout.writestr(name, data)

with open(TEMPLATE, "wb") as f:
    f.write(buf.getvalue())

with zipfile.ZipFile(TEMPLATE, "r") as z:
    wb2 = z.read("xl/workbook.xml").decode("utf-8")
    sheets = re.findall(r'<sheet name="([^"]+)"', wb2)
    print("Done! Sheets:", sheets)
