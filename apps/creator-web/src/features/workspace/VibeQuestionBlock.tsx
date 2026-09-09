import { useState } from "react";
import { Button, Field, Input, Select } from "@evcp/ui";
import { Send } from "lucide-react";
import { buildQuestionAnswerMessage, type VibeQuestion } from "./vibe-questions";

const OTHER = "__other__";

// Shows one question at a time, retaining answers locally until the final submission.
export function VibeQuestionBlock({
  questions,
  disabled,
  onSubmit
}: {
  questions: VibeQuestion[];
  disabled: boolean;
  onSubmit: (message: string) => void;
}) {
  const [step, setStep] = useState(0);
  const [choices, setChoices] = useState<Record<string, string>>({});
  const [customs, setCustoms] = useState<Record<string, string>>({});
  if (!questions.length) return null;

  const answerFor = (question: VibeQuestion): string => {
    const choice = choices[question.id] ?? "";
    if (choice === OTHER) return customs[question.id]?.trim() ?? "";
    return choice;
  };
  const index = Math.min(step, questions.length - 1);
  const question = questions[index];
  const isLast = index === questions.length - 1;
  const allAnswered = questions.every((question) => answerFor(question).length > 0);

  return (
    <div className="vibe-question-block" role="group" aria-label="Clarifying questions">
      <p className="vibe-question-progress" role="status">
        Question {index + 1} of {questions.length}
      </p>
      <Field key={question.id} label={question.question} htmlFor={`vq-${question.id}`}>
        <Select
          id={`vq-${question.id}`}
          value={choices[question.id] ?? ""}
          disabled={disabled}
          onChange={(event) =>
            setChoices((current) => ({ ...current, [question.id]: event.target.value }))
          }
        >
          <option value="" disabled>
            Select an answer…
          </option>
          {question.options.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
          <option value={OTHER}>Other — enter your own</option>
        </Select>
        {choices[question.id] === OTHER && (
          <Input
            aria-label={`Your answer: ${question.question}`}
            placeholder="Enter your answer"
            value={customs[question.id] ?? ""}
            disabled={disabled}
            onChange={(event) =>
              setCustoms((current) => ({ ...current, [question.id]: event.target.value }))
            }
          />
        )}
      </Field>
      <div className="vibe-question-actions">
        <Button
          variant="secondary"
          size="sm"
          type="button"
          disabled={disabled || index === 0}
          onClick={() => setStep(index - 1)}
        >
          Back
        </Button>
        {isLast ? (
          <Button
            variant="primary"
            size="sm"
            type="button"
            disabled={disabled || !allAnswered}
            onClick={() =>
              onSubmit(
                buildQuestionAnswerMessage(
                  questions.map((question) => ({
                    question: question.question,
                    answer: answerFor(question)
                  }))
                )
              )
            }
          >
            <Send size={14} />
            Submit answers ({questions.length})
          </Button>
        ) : (
          <Button
            variant="primary"
            size="sm"
            type="button"
            disabled={disabled || !answerFor(question)}
            onClick={() => setStep(index + 1)}
          >
            Next
          </Button>
        )}
      </div>
    </div>
  );
}
