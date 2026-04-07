import styles from "./ReferencedFiles.module.css";

type Props = {
  files: string[];
};

export function ReferencedFiles({ files }: Props) {
  if (files.length === 0) return null;

  return (
    <div className={styles.card}>
      <span className={styles.title}>Referenced Files</span>
      <div className={styles.list}>
        {files.map((file) => (
          <span key={file} className={styles.file}>
            {file}
          </span>
        ))}
      </div>
    </div>
  );
}
