export type FaqEntry = { question: string; answer: string };

export const faqContent = {
  eyebrow: "FAQ",
  title: "Questions worth asking first.",
  entries: [
    {
      question: "Which AI models can it use?",
      answer:
        "Providers are configured through a gateway, so Horizon points at the models your organisation already approves rather than at a fixed vendor."
    },
    {
      question: "Where does my data live?",
      answer:
        "On your own server. The platform is designed to run entirely inside your network, including the database, object storage, and identity provider."
    },
    {
      question: "Can it run on Kubernetes?",
      answer:
        "The reference deployment is Docker Compose. Nothing in the platform hardcodes Compose service names or local filesystem assumptions, so a Kubernetes migration stays open."
    },
    {
      question: "Is it production ready?",
      answer:
        "It is under active development and ships in numbered sprints. Read the architecture decision records to judge fit before you depend on it."
    }
  ] as const satisfies readonly FaqEntry[]
};
