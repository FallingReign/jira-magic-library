/**
 * Display Utilities
 * Beautiful terminal output formatting
 */

import chalk from 'chalk';
import boxen from 'boxen';
import * as readline from 'readline';

/**
 * Display welcome banner
 */
export function showWelcome() {
  const banner = boxen(
    chalk.bold.cyan('🪄 JIRA Magic Library - Interactive Demo'),
    {
      padding: 1,
      margin: 1,
      borderStyle: 'round',
      borderColor: 'cyan',
    }
  );
  console.log(banner);
}

/**
 * Display section header
 */
export function showHeader(title) {
  console.log('\n' + chalk.bold.blue('═'.repeat(60)));
  console.log(chalk.bold.blue(`  ${title}`));
  console.log(chalk.bold.blue('═'.repeat(60)) + '\n');
}

/**
 * Success message
 */
export function success(message) {
  console.log(chalk.green('✓') + ' ' + message);
}

/**
 * Error message
 */
export function error(message) {
  console.log(chalk.red('✗') + ' ' + chalk.red(message));
}

/**
 * Info message
 */
export function info(message) {
  console.log(chalk.blue('ℹ') + ' ' + message);
}

/**
 * Warning message
 */
export function warning(message) {
  console.log(chalk.yellow('⚠') + ' ' + chalk.yellow(message));
}

/**
 * Display created issue details
 */
export function showIssue(key, baseUrl, fields) {
  const issueBox = boxen(
    chalk.bold.green(`Issue Created: ${key}\n\n`) +
    chalk.gray(`View: ${baseUrl}/browse/${key}`) +
    (fields ? '\n\n' + chalk.bold('Fields Set:\n') + 
      Object.entries(fields)
        .map(([k, v]) => chalk.gray(`  • ${k}: `) + chalk.white(JSON.stringify(v)))
        .join('\n') : ''),
    {
      padding: 1,
      margin: 1,
      borderStyle: 'round',
      borderColor: 'green',
    }
  );
  console.log(issueBox);
}

/**
 * Display code/data
 */
export function showCode(titleOrCode, code) {
  // Support both showCode(code) and showCode(title, code)
  if (code === undefined) {
    // Single argument: treat as code only
    console.log(chalk.gray('─'.repeat(60)));
    console.log(chalk.cyan(titleOrCode));
    console.log(chalk.gray('─'.repeat(60)) + '\n');
  } else {
    // Two arguments: title and code
    console.log('\n' + chalk.bold(titleOrCode));
    console.log(chalk.gray('─'.repeat(60)));
    console.log(chalk.cyan(code));
    console.log(chalk.gray('─'.repeat(60)) + '\n');
  }
}

/**
 * Clear screen
 */
export function clear() {
  console.clear();
}

/**
 * Pause with message
 */
export async function pause(message = 'Press Enter to continue...') {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(chalk.dim(`\n${message}`), () => {
      rl.close();
      resolve();
    });
  });
}
