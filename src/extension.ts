// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { spawnSync } from "child_process";

import {
	ExtensionContext,
	CancellationTokenSource,
	workspace,
	commands,
	window,
	ViewColumn,
	TextDocumentShowOptions,
} from "vscode";


import { PrettyFLEProvider } from "./PrettyFLEProvider";
import { EditorRedrawWatcher } from "./EditorRedrawWatcher";
import {
	executeRegisteredTextEditorDecorationProviders,
	registerTextEditorDecorationProvider,
} from "./TextEditorDecorationProvider";
import { TextDecoder } from 'util';

class MyFoldingRangeProvider implements vscode.FoldingRangeProvider {
    provideFoldingRanges(document: vscode.TextDocument, context: vscode.FoldingContext, token: vscode.CancellationToken): vscode.FoldingRange[] {
        let ranges: vscode.FoldingRange[] = [];
        let last_date_line=null;
		let dateMatch: RegExp = /\b((date\s+\+*)|(\d\d|\d{4})[\/\-]\d{1,2}[\/\-]\d{1,2})/i;
		for (let i = 0; i < document.lineCount; i++) {
            const line = document.lineAt(i).text.trim();
            if (dateMatch.test(line)) {
				if (last_date_line){
                	ranges.push(new vscode.FoldingRange(last_date_line, i-1, vscode.FoldingRangeKind.Region));
				}
				last_date_line = i
            }
        }
		if (last_date_line){
			ranges.push(new vscode.FoldingRange(last_date_line, document.lineCount-1, vscode.FoldingRangeKind.Region));
		}
        return ranges;
    }
}

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
	const editorRedrawWatcher = new EditorRedrawWatcher();
	context.subscriptions.push(editorRedrawWatcher);
	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	console.log('Congratulations, your extension "flecode" is now active!');
	vscode.workspace.registerTextDocumentContentProvider('flecode.pretty', new PrettyFLEProvider(editorRedrawWatcher));
	vscode.languages.registerFoldingRangeProvider({ scheme: 'file', language: 'fle' }, new MyFoldingRangeProvider());
	const showPretty = async (options?: TextDocumentShowOptions) => {
		const actualUri = window.activeTextEditor?.document.uri;

		if (!actualUri) {
			return;
		}

		const providerUri = PrettyFLEProvider.toProviderUri(actualUri);
		

		await window.showTextDocument(providerUri, options);
	};

	const exportADIF = async () => {
		const actualText = window.activeTextEditor?.document.getText();
		var path = vscode.workspace.getConfiguration('flecode').get("flecliPath","flicli");
		var child = spawnSync(path, ["adif","-i","--overwrite", "/dev/stdin","/dev/stdout"], { input: actualText });
		if (child.error && child.error.message.indexOf("ENOENT") != -1){
			vscode.window.showErrorMessage("ENOENT error launching flecli - have you installed it?");
		} else {
			const header = "ADIF Export for Fast Log Entry by DF3CB"; // hacky way to get rid of the usual log output
			const footer = "Successfully wrote";

			try {
				var output = header + new TextDecoder().decode(child.stdout).split(header)[1].split(footer)[0];
			} catch {
				vscode.window.showErrorMessage("Error parsing flecli output");
				output = new TextDecoder().decode(child.stdout);
			}
			vscode.workspace.openTextDocument({
				content: output, 
				language: "text"
			}).then(newDocument => {
				vscode.window.showTextDocument(newDocument);
			});
		}
		return; //spans.map((span) => actualText.substr(span.offset, span.length)).join("");
	}

	context.subscriptions.push(
		commands.registerCommand(`flecode.showPretty`, () => showPretty({ viewColumn: ViewColumn.Active }))
	);
	context.subscriptions.push(
		commands.registerCommand(`flecode.showPrettyToSide`, () => showPretty({ viewColumn: ViewColumn.Beside }))
	);
	context.subscriptions.push(
		commands.registerCommand(`flecode.exportADIF`, () => exportADIF())
	);

	context.subscriptions.push(
		editorRedrawWatcher.onEditorRedraw(async (editor) => {
			const tokenSource = new CancellationTokenSource();
			await executeRegisteredTextEditorDecorationProviders(editor, tokenSource.token);
			tokenSource.dispose();
		})
	);
}

// this method is called when your extension is deactivated
export function deactivate() { }
