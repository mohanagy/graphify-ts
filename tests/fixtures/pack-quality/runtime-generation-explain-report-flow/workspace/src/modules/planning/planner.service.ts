export async function planIdeaReport(problem: string): Promise<{ sections: string[] }> {
  return {
    sections: [`summary:${problem}`, 'evidence'],
  }
}
