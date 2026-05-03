import styles from "./page.module.css";

export function QrImage({ dataUrl, alt }: { dataUrl: string; alt: string }) {
  return (
    <div className={styles.qrCode}>
      {/* eslint-disable-next-line @next/next/no-img-element -- data URL, not a remote image */}
      <img src={dataUrl} alt={alt} width={240} height={240} />
    </div>
  );
}
