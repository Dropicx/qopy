module.exports = {
  // Print width - try to keep lines under 100 characters
  printWidth: 100,

  // Use 2 spaces for indentation
  tabWidth: 2,

  // Use spaces instead of tabs
  useTabs: false,

  // Add semicolons at the end of statements
  semi: true,

  // Use single quotes instead of double quotes
  singleQuote: true,

  // Only add quotes around object properties when needed
  quoteProps: 'as-needed',

  // Use single quotes in JSX
  jsxSingleQuote: false,

  // Add trailing commas where valid in ES5 (objects, arrays, etc.)
  trailingComma: 'es5',

  // Print spaces between brackets in object literals
  bracketSpacing: true,

  // Put the > of a multi-line JSX element at the end of the last line
  bracketSameLine: false,

  // Include parentheses around a sole arrow function parameter
  arrowParens: 'always',

  // Format only files that have a special comment at the top
  requirePragma: false,

  // Insert a special @format marker at the top of formatted files
  insertPragma: false,

  // Wrap prose if it exceeds the print width
  proseWrap: 'preserve',

  // Respect whitespace sensitivity in HTML
  htmlWhitespaceSensitivity: 'css',

  // Use LF line endings
  endOfLine: 'lf',

  // Don't format embedded code blocks
  embeddedLanguageFormatting: 'auto',

  // Allow single attribute per line in HTML, JSX, etc.
  singleAttributePerLine: false,
};
