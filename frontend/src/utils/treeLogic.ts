import type { DocumentNode } from '../types';

export const toggleNode = (tree: DocumentNode[], targetId: string | number, checkState: boolean): DocumentNode[] => {
  const newTree = JSON.parse(JSON.stringify(tree));

  const updateDescendants = (node: DocumentNode, state: boolean) => {
    node.checked = state;
    node.indeterminate = false;
    if (node.children) {
      node.children.forEach(c => updateDescendants(c, state));
    }
  };

  const findAndToggle = (nodes: DocumentNode[]): boolean => {
    for (const node of nodes) {
      if (node.id === targetId) {
        updateDescendants(node, checkState);
        return true;
      }
      if (node.children && findAndToggle(node.children)) {
        return true;
      }
    }
    return false;
  };

  findAndToggle(newTree);

  const updateAncestors = (nodes: DocumentNode[]) => {
    let allChecked = true;
    let someChecked = false;

    for (const node of nodes) {
      if (node.children && node.children.length > 0) {
        const { all, some } = updateAncestors(node.children);
        node.checked = all;
        node.indeterminate = !all && some;
      }
      
      if (node.checked) {
        someChecked = true;
      } else {
        allChecked = false;
      }
      if (node.indeterminate) {
        someChecked = true;
      }
    }

    return { all: allChecked && nodes.length > 0, some: someChecked };
  };

  updateAncestors(newTree);
  return newTree;
};

export const updateNodeProperty = (tree: DocumentNode[], targetId: string | number, property: keyof DocumentNode, value: any): DocumentNode[] => {
  const newTree = JSON.parse(JSON.stringify(tree));
  const updateRecursive = (nodes: DocumentNode[]): boolean => {
    for (const node of nodes) {
      if (node.id === targetId) {
        (node as any)[property] = value;
        return true;
      }
      if (node.children && updateRecursive(node.children)) {
        return true;
      }
    }
    return false;
  };
  updateRecursive(newTree);
  return newTree;
};


export const toggleContentNode = (tree: DocumentNode[], targetId: string | number, checkState: boolean): DocumentNode[] => {
  const newTree = JSON.parse(JSON.stringify(tree));
  const toggleRecursive = (nodes: DocumentNode[]) => {
    for (const node of nodes) {
      if (node.id === targetId) {
        node.contentChecked = checkState;
        return true;
      }
      if (node.children && toggleRecursive(node.children)) {
        return true;
      }
    }
    return false;
  };
  toggleRecursive(newTree);
  return newTree;
};
