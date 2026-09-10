import { useId, useRef, useState } from "react";
import { Button, Input } from "@evcp/ui";
import { ArrowLeft, ArrowRight, Check, Send } from "lucide-react";
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
  const groupId = useId();
  const heading = useRef<HTMLLegendElement>(null);
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
  const moveTo = (next: number) => {
    setStep(next);
    heading.current?.focus();
  };

  return (
    <div className="vibe-question-block" role="group" aria-label="Clarifying questions">
      <div className="vibe-question-progress">
        <span role="status">
          Question {index + 1} of {questions.length}
        </span>
        <span className="vibe-question-steps" aria-hidden="true">
          {questions.map((item, position) => (
            <span key={item.id} className={position <= index ? "is-complete" : undefined} />
          ))}
        </span>
      </div>
      <fieldset className="vibe-question-fieldset" disabled={disabled}>
        <legend ref={heading} tabIndex={-1}>
          {question.question}
        </legend>
        <p className="vibe-question-hint" id={`${groupId}-hint`}>
          Choose one answer
        </p>
        <div className="vibe-question-choices">
          {[...question.options, OTHER].map((option, optionIndex) => (
            <label className="vibe-question-choice" key={`${question.id}-${optionIndex}`}>
              <span className="vibe-question-radio">
                <input
                  type="radio"
                  name={`${groupId}-${question.id}`}
                  value={option}
                  checked={choices[question.id] === option}
                  disabled={disabled}
                  aria-describedby={`${groupId}-hint`}
                  onChange={() => setChoices((current) => ({ ...current, [question.id]: option }))}
                />
                <Check size={12} aria-hidden="true" />
              </span>
              <span>{option === OTHER ? "Other — enter your own" : option}</span>
            </label>
          ))}
        </div>
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
      </fieldset>
      <div className="vibe-question-actions">
        <Button
          variant="secondary"
          size="sm"
          type="button"
          disabled={disabled || index === 0}
          onClick={() => moveTo(index - 1)}
        >
          <ArrowLeft size={14} aria-hidden="true" />
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
            onClick={() => moveTo(index + 1)}
          >
            Next
            <ArrowRight size={14} aria-hidden="true" />
          </Button>
        )}
      </div>
      <p className="vibe-question-hint vibe-question-submit-hint">
        Answers are sent together when you select Submit answers.
      </p>
    </div>
  );
}
