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
  children?: DocumentNode[];
}
