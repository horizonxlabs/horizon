import styles from "./page.module.css";

export default function HomePage() {
  return (
    <main className={`${styles.home} starter-home`}>
      <div className={styles.glow} aria-hidden="true" />
      <p className={styles.message}>Your app starts here. Ask the AI to build a feature.</p>
    </main>
  );
}
