export interface DocumentNode {
  id: string | number;
  title: string;
  type: string;
  checked: boolean;
  contentChecked?: boolean;
  indeterminate?: boolean;
  children?: DocumentNode[];
}
