import styles from "./loading.module.css";

export default function NewIssueLoading() {
  return (
    <div className={styles.container}>
      <div className={styles.topBar}>
        <div className={styles.backSkel} />
        <div className={styles.titleSkel} />
        <div className={styles.submitSkel} />
      </div>
      <div className={styles.form}>
        <div className={styles.fieldLabelSkel} />
        <div className={styles.repoSkel} />
        <div className={styles.fieldLabelSkel} />
        <div className={styles.inputSkel} />
        <div className={styles.fieldLabelSkel} />
        <div className={styles.textareaSkel} />
      </div>
    </div>
  );
}
