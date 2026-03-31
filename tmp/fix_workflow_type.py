import os

file_path = r'd:\Desktop\proposal_system\frontend\src\components\AnalysisWorkflow.tsx'
with open(file_path, 'r', encoding='utf-8') as f:
    lines = f.readlines()

new_lines = []
target = "await api.saveProject(props.documentId, props.fileName || 'Unknown', selectedIds, contentIds, draftTree);"
replacement = "await api.saveProject(props.documentId, props.fileName || 'Untitled', props.fileName || 'Unknown File', selectedIds, contentIds, draftTree);"

replaced = False
for line in lines:
    if target in line:
        new_lines.append(line.replace(target, replacement))
        replaced = True
    else:
        new_lines.append(line)

if replaced:
    with open(file_path, 'w', encoding='utf-8') as f:
        f.writelines(new_lines)
    print("SUCCESS: Line 887 replaced.")
else:
    print("ERROR: Target line not found.")
