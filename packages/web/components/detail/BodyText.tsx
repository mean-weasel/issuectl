import styles from "./BodyText.module.css";

type Props = {
  body: string | null | undefined;
};

export function BodyText({ body }: Props) {
  if (!body || body.trim().length === 0) {
    return (
      <div className={styles.empty}>
        <em>no description</em>
      </div>
    );
  }
  return <div className={styles.body}>{body}</div>;
}
