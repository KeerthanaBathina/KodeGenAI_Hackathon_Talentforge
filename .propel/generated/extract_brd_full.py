import zipfile
import xml.etree.ElementTree as ET
p = 'AI_Interview_Workflow_BRD.docx'
with zipfile.ZipFile(p) as z:
    xml = z.read('word/document.xml')
root = ET.fromstring(xml)
ns = {'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}
paras = []
for para in root.findall('.//w:p', ns):
    text = ''.join(t.text or '' for t in para.findall('.//w:t', ns)).strip()
    if text:
        paras.append(text)
open('.propel/generated/AI_Interview_Workflow_BRD_extracted.txt','w',encoding='utf-8').write('\n'.join(paras))
print(len(paras))
print('written')
