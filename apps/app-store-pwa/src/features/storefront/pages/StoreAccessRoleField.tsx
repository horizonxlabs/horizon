export function selectedStoreRole(availableRoles: string[] | undefined, requestedRole: string): string {
  return availableRoles?.includes(requestedRole)
    ? requestedRole
    : availableRoles?.[0] ?? requestedRole;
}

export function StoreAccessRoleField({
  availableRoles,
  value,
  onChange
}: {
  availableRoles?: string[];
  value: string;
  onChange(value: string): void;
}) {
  if (!availableRoles?.length) {
    return (
      <input
        name="requestedRoleKey"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    );
  }
  return (
    <select
      name="requestedRoleKey"
      value={selectedStoreRole(availableRoles, value)}
      onChange={(event) => onChange(event.target.value)}
    >
      {availableRoles.map((role) => (
        <option key={role} value={role}>
          {role.replaceAll("_", " ")}
        </option>
      ))}
    </select>
  );
}
