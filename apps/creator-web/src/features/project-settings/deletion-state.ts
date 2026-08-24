export function canConfirmProjectDeletion(confirmation: string, projectName: string): boolean {
  return projectName.length > 0 && confirmation === projectName;
}
