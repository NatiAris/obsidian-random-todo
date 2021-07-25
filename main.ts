import {App, EditorPosition, FileSystemAdapter, MarkdownView, Plugin, PluginSettingTab, Setting} from 'obsidian';
import {readFileSync} from 'fs';
import {randomInt} from "crypto";
import * as path from "path";

interface MyPluginSettings {
    todoPattern: string;
    showStatusBar: boolean;
}

const DEFAULT_SETTINGS: MyPluginSettings = {
    todoPattern: '(^|\\s)\\.\\.\\.(\\s|$)',
    showStatusBar: false
}

export default class MyPlugin extends Plugin {
    settings: MyPluginSettings;
    statusBarItem: HTMLElement;

    collectTodos = (): Map<string, Array<EditorPosition>> => {
        // return a map file name -> list of match positions
        const markdownFiles = this.app.vault.getMarkdownFiles();
        const collected = new Map<string, Array<EditorPosition>>(null);

        if (this.app.vault.adapter instanceof FileSystemAdapter) {
            let basePath = this.app.vault.adapter.getBasePath();

            for (const markdownFile of markdownFiles) {
                const re = new RegExp(this.settings.todoPattern, 'g');
                const fullPath = path.join(basePath, markdownFile.path);
                const file = readFileSync(fullPath, 'utf-8');
                const lines = file.split('\n');
                const positions: Array<EditorPosition> = lines.map((value, index) => ({
                    line: index,
                    ch: value.search(re)
                })).filter(value => value.ch != -1);
                if (positions.length > 0) {
                    collected.set(markdownFile.path, positions);
                }
            }
        }

        return collected;
    };

    async onload() {
        console.log('loading plugin');

        await this.loadSettings();

        if (this.settings.showStatusBar) {
            this.statusBarItem = this.addStatusBarItem();
            this.app.workspace.on("file-open", (file) => {
                if (this.app.vault.adapter instanceof FileSystemAdapter) {
                    let basePath = this.app.vault.adapter.getBasePath();
                    const contents = readFileSync(basePath + '/' + file.path, 'utf-8');
                    const N = [...contents.matchAll(new RegExp(this.settings.todoPattern, 'g'))].length;
                    const text = N > 0 ? N + ' to-do items' : '';
                    this.statusBarItem.setText(text);
                }
            })
        }

        this.addCommand({
            id: 'open-random-todo-file',
            name: 'Random Todo: File',
            callback: () => {
                const collected = this.collectTodos();
                const collectedLinks = [...collected.keys()];

                this.app.workspace.openLinkText(collectedLinks[randomInt(collectedLinks.length)], '');
            }
        });

        this.addCommand({
            id: 'open-random-todo-item',
            name: 'Random Todo: Item',
            callback: () => {
                const collected = this.collectTodos();
                const collectedLinks = Array<[string, EditorPosition]>();
                for (let [path, indexes] of collected) {
                    for (let index of indexes) {
                        collectedLinks.push([path, index]);
                    }
                }

                const pos = randomInt(collectedLinks.length);
                const [link, index] = collectedLinks[pos];
                this.app.workspace.openLinkText(link, '').then(() => {
                    const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
                    activeView.editor.setCursor(index);
                });
            }
        });

        this.addSettingTab(new MyPluginSettingTab(this.app, this));

        this.registerCodeMirror((cm: CodeMirror.Editor) => {
            console.log('codemirror', cm);
        });

    }

    onunload() {
        console.log('unloading plugin');
    }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }
}

class MyPluginSettingTab extends PluginSettingTab {
    plugin: MyPlugin;

    constructor(app: App, plugin: MyPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        let {containerEl} = this;

        containerEl.empty();

        containerEl.createEl('h2', {text: 'Settings for Random To-Do Plugin'});

        new Setting(containerEl)
            .setName('To-do item pattern')
            .setDesc('Regular expression which a to-do item should match')
            .addText(text => text
                .setPlaceholder(DEFAULT_SETTINGS.todoPattern)
                .setValue(this.plugin.settings.todoPattern)
                .onChange(async (value) => {
                    this.plugin.settings.todoPattern = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('To-do item count view')
            .setDesc('Show/hide todo count in Status Bar')
            .addToggle(component => component
                .setValue(this.plugin.settings.showStatusBar)
                .onChange(async (value) => {
                    if (value) {
                        this.plugin.statusBarItem.show()
                    } else {
                        this.plugin.statusBarItem.hide()
                    }
                    this.plugin.settings.showStatusBar = value;
                    await this.plugin.saveSettings();
                }));
    }
}
