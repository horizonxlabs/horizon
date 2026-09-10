// Structured clarifying questions: the build prompt lets the model batch up to four
// <question> blocks (first line = the question, then "- option" lines). They render as
// one list of choices at a time with an automatic "type it yourself" escape, and every answer submits back
// as ONE combined message — no ping-pong.

export type VibeQuestion = { id: string; question: string; options: string[] };

const QUESTION_PATTERN = /<question>([\s\S]*?)<\/question>/g;
const MAX_QUESTIONS = 4;
const MAX_OPTIONS = 5;

export function extractQuestions(text: string): { text: string; questions: VibeQuestion[] } {
  const questions: VibeQuestion[] = [];
  for (const match of text.matchAll(QUESTION_PATTERN)) {
    if (questions.length >= MAX_QUESTIONS) break;
    const lines = match[1]
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    const question = lines.find((line) => !line.startsWith("- ")) ?? "";
    const options = lines
      .filter((line) => line.startsWith("- "))
      .map((line) => line.slice(2).trim())
      .filter(Boolean)
      .slice(0, MAX_OPTIONS);
    if (!question || options.length < 2) continue;
    questions.push({ id: `q-${questions.length}`, question, options });
  }
  const cleaned = text
    .replace(QUESTION_PATTERN, "")
    .replace(/[ \t]+$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trimEnd();
  return { text: cleaned, questions };
}

export function stripQuestions(text: string): string {
  return extractQuestions(text).text;
}

export function buildQuestionAnswerMessage(
  pairs: Array<{ question: string; answer: string }>
): string {
  return (
    "Continue the current request using these answers. Keep the same scope and mode:\n\n" +
    pairs.map((pair) => `${pair.question}: ${pair.answer}`).join("\n")
  );
}
