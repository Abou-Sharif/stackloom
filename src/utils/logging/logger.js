// Logger utility for consistent logging across CLI commands
import chalk from 'chalk';

export class Logger {
  static info(message) {
    console.log(chalk.blue(`ℹ ${message}`));
  }

  static success(message) {
    console.log(chalk.green(`✓ ${message}`));
  }

  static warning(message) {
    console.log(chalk.yellow(`⚠ ${message}`));
  }

  static error(message) {
    console.error(chalk.red(`✗ ${message}`));
  }

  static debug(message) {
    if (process.env.LOOM_DEBUG === 'true') {
      console.log(chalk.gray(`[DEBUG] ${message}`));
    }
  }

  static gray(message) {
    console.log(chalk.gray(message));
  }

  static cyan(message) {
    console.log(chalk.cyan(message));
  }

  static progress(message) {
    // For use with ora or similar spinners
    process.stdout.write(`\r${chalk.cyan(`⟳ ${message}`)}`);
  }

  static clearProgress() {
    // Clear progress line
    process.stdout.clearLine();
    process.stdout.cursorTo(0);
  }
}

export default Logger;