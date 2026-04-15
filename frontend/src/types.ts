export interface DocumentNode {
  id: string | number;
  title: string;
  type: string;
  checked: boolean;
  contentChecked?: boolean;
  indeterminate?: boolean;
  writingGuide?: string | null;
  userInstruction?: string | null;
  tableMetadata?: string | null;
  content?: boolean;
  draft_content?: string | null;
  extended_content?: string | null;
  children?: DocumentNode[];
}
export interface DraftGenerateRequest {
  documentId: string;
  modelId?: string;
  researchMode?: 'fast' | 'deep';
}
