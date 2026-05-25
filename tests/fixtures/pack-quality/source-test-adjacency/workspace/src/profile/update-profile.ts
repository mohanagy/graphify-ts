export function updateProfile(input: { displayName: string }) {
  const displayName = input.displayName.trim()
  if (!displayName) {
    throw new Error('displayName is required')
  }

  return { ...input, displayName }
}
