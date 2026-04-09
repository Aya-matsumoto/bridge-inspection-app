"""
record_template.xlsx の写真シート (1) を20枚にする。
openpyxl を使わず、zipfile で XML を直接コピーするため
ファイルが壊れる心配がない。
"""
import zipfile
import shutil
import re
import io

TEMPLATE    = "record_template.xlsx"
TOTAL       = 20   # 最大対応件数

# ── バックアップ ──
shutil.copy(TEMPLATE, TEMPLATE + ".bak")
print(f"バックアップ作成: {TEMPLATE}.bak")

# ── テンプレートの中身を全て読み込む ──
orig_files: dict[str, bytes] = {}
with zipfile.ZipFile(TEMPLATE, "r") as z:
    for name in z.namelist():
        orig_files[name] = z.read(name)

print("既存ファイル数:", len(orig_files))

# ── 写真シート (1) の情報を確認 ──
# workbook.xml から (1) が rId2 → sheet2.xml とわかっているので固定値を使う
# （変更が必要な場合はここを修正）
PHOTO_SHEET_XML      = "xl/worksheets/sheet2.xml"       # (1) の本体
PHOTO_SHEET_RELS     = "xl/worksheets/_rels/sheet2.xml.rels"
PHOTO_PRINTER_BIN    = "xl/printerSettings/printerSettings2.bin"

# 既存の写真シート数（テンプレートには (1)(2)(3) の3枚）
EXISTING_COUNT = 3

# ── 新しいシートのファイルを生成（4枚目以降） ──
# 既存のファイル番号の最大値を探す
existing_sheet_nums = [
    int(re.search(r'sheet(\d+)\.xml$', name).group(1))
    for name in orig_files
    if re.search(r'xl/worksheets/sheet\d+\.xml$', name)
]
next_sheet_num = max(existing_sheet_nums) + 1  # 5 から始まる

existing_printer_nums = [
    int(re.search(r'printerSettings(\d+)\.bin$', name).group(1))
    for name in orig_files
    if re.search(r'printerSettings\d+\.bin$', name)
]
next_printer_num = max(existing_printer_nums) + 1  # 5 から始まる

# 既存の rId の最大値
rels_xml = orig_files["xl/_rels/workbook.xml.rels"].decode("utf-8")
existing_rids = [int(m) for m in re.findall(r'Id="rId(\d+)"', rels_xml)]
next_rid = max(existing_rids) + 1

# workbook.xml の既存 sheetId の最大値
wb_xml = orig_files["xl/workbook.xml"].decode("utf-8")
existing_sheet_ids = [int(m) for m in re.findall(r'sheetId="(\d+)"', wb_xml)]
next_sheet_id = max(existing_sheet_ids) + 1

print(f"次のシートファイル番号: {next_sheet_num} から")
print(f"次の printerSettings 番号: {next_printer_num} から")
print(f"次の rId 番号: {next_rid} から")
print(f"次の sheetId 番号: {next_sheet_id} から")

# ── 追加するファイルを生成 ──
new_files: dict[str, bytes] = {}

# 追加シートのメタ情報リスト
new_sheets = []  # (シート表示名, rId, sheetId, xmlファイルパス, printerファイルパス)

for i in range(EXISTING_COUNT + 1, TOTAL + 1):
    sheet_display = f"({i})"
    xml_path      = f"xl/worksheets/sheet{next_sheet_num}.xml"
    rels_path     = f"xl/worksheets/_rels/sheet{next_sheet_num}.xml.rels"
    printer_path  = f"xl/printerSettings/printerSettings{next_printer_num}.bin"
    rid           = f"rId{next_rid}"
    sid           = next_sheet_id

    # sheet XML はそのままコピー（書式・高さ・罫線・結合がすべて保持される）
    new_files[xml_path]     = orig_files[PHOTO_SHEET_XML]

    # printerSettings もそのままコピー
    new_files[printer_path] = orig_files[PHOTO_PRINTER_BIN]

    # _rels は printerSettings のファイル名だけ差し替え
    new_rels = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        f'<Relationship Id="rId1" '
        f'Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/printerSettings" '
        f'Target="../printerSettings/printerSettings{next_printer_num}.bin"/>'
        '</Relationships>'
    )
    new_files[rels_path] = new_rels.encode("utf-8")

    new_sheets.append((sheet_display, rid, sid, xml_path, printer_path))
    print(f"  生成: {sheet_display} → {xml_path}, {printer_path}")

    next_sheet_num  += 1
    next_printer_num += 1
    next_rid         += 1
    next_sheet_id    += 1

# ── workbook.xml を更新（<sheets> に追加） ──
new_sheet_entries = "\n".join(
    f'<sheet name="{name}" sheetId="{sid}" r:id="{rid}"/>'
    for name, rid, sid, _, _ in new_sheets
)
wb_xml_updated = wb_xml.replace(
    "</sheets>",
    new_sheet_entries + "</sheets>"
)
orig_files["xl/workbook.xml"] = wb_xml_updated.encode("utf-8")

# ── workbook.xml.rels を更新 ──
new_rel_entries = "\n".join(
    f'<Relationship Id="{rid}" '
    f'Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" '
    f'Target="worksheets/sheet{i}.xml"/>'
    for i, (_, rid, _, xml_path, _) in enumerate(new_sheets, start=next_sheet_num - len(new_sheets))
)
# rels の </Relationships> の前に挿入
rels_updated = rels_xml.replace(
    "</Relationships>",
    new_rel_entries + "</Relationships>"
)
orig_files["xl/_rels/workbook.xml.rels"] = rels_updated.encode("utf-8")

# ── [Content_Types].xml を更新 ──
ct_xml = orig_files["[Content_Types].xml"].decode("utf-8")
new_ct_entries = ""
for name, _, _, xml_path, printer_path in new_sheets:
    abs_xml = "/" + xml_path
    abs_bin = "/" + printer_path
    new_ct_entries += (
        f'<Override PartName="{abs_xml}" '
        f'ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
    )
    # printerSettings は Default の "bin" で既にカバーされているので追加不要

ct_updated = ct_xml.replace("</Types>", new_ct_entries + "</Types>")
orig_files["[Content_Types].xml"] = ct_updated.encode("utf-8")

# ── 全ファイルを結合して新しい xlsx を書き出す ──
all_files = {**orig_files, **new_files}

buf = io.BytesIO()
with zipfile.ZipFile(buf, "w", compression=zipfile.ZIP_DEFLATED) as zout:
    for name, data in all_files.items():
        zout.writestr(name, data)

with open(TEMPLATE, "wb") as f:
    f.write(buf.getvalue())

print(f"\n完了: {TEMPLATE} を更新しました（写真シート {TOTAL} 枚）")
