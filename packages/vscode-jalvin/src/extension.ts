// ─────────────────────────────────────────────────────────────────────────────
// Jalvin VS Code Extension — entry point
//
// Registers a DocumentFormattingEditProvider for .jalvin files so that
// "Format Document" (⇧⌥F / Shift+Alt+F) works out of the box.
// ─────────────────────────────────────────────────────────────────────────────

import * as vscode from "vscode";
import { format } from "./formatter";

export function activate(context: vscode.ExtensionContext): void {
  const provider = vscode.languages.registerDocumentFormattingEditProvider(
    "jalvin",
    {
      provideDocumentFormattingEdits(
        document: vscode.TextDocument,
        options: vscode.FormattingOptions
      ): vscode.TextEdit[] {
        const source = document.getText();

        let formatted: string;
        try {
          formatted = format(source, {
            indentSize: options.insertSpaces ? options.tabSize : 4,
          });
        } catch {
          // If formatting fails (e.g. due to malformed input) return no edits
          // rather than corrupting the document.
          return [];
        }

        if (formatted === source) {
          return [];
        }

        const fullRange = new vscode.Range(
          document.positionAt(0),
          document.positionAt(source.length)
        );

        return [new vscode.TextEdit(fullRange, formatted)];
      },
    }
  );

  context.subscriptions.push(provider);
}

export function deactivate(): void {
  // Nothing to clean up.
}
