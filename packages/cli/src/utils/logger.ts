import chalk from "chalk";

export function banner(): void {
  console.error(chalk.bold("issuectl v0.1.0"));
}

export function success(message: string): void {
  console.error(chalk.green("✓") + " " + message);
}

export function info(message: string): void {
  console.error(chalk.blue("ℹ") + " " + message);
}

export function warn(message: string): void {
  console.error(chalk.yellow("⚠") + " " + message);
}

export function error(message: string): void {
  console.error(chalk.red("✗") + " " + message);
}
