export interface QuizQuestion {
  question: string;
  options: string[];
  correctIndex: number;
}

export function parseQuizQuestions(raw: unknown): QuizQuestion[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (q): q is QuizQuestion =>
      typeof q === "object" &&
      q !== null &&
      typeof (q as QuizQuestion).question === "string" &&
      Array.isArray((q as QuizQuestion).options) &&
      typeof (q as QuizQuestion).correctIndex === "number",
  );
}

export function scoreQuiz(questions: QuizQuestion[], answers: number[]): number {
  if (questions.length === 0) return 0;
  const correct = questions.reduce((acc, q, i) => (answers[i] === q.correctIndex ? acc + 1 : acc), 0);
  return Math.round((correct / questions.length) * 100);
}
