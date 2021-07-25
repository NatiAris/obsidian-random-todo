import {App, EditorPosition, MarkdownView, Plugin, PluginSettingTab, Setting} from 'obsidian';

interface RandomTodoPluginSettings {
    todoPattern: string;
    showStatusBar: boolean;
}

const DEFAULT_SETTINGS: RandomTodoPluginSettings = {
    todoPattern: '(^|\\s)\\.\\.\\.(\\s|$)',
    showStatusBar: false
}

export default class RandomTodoPlugin extends Plugin {
    settings: RandomTodoPluginSettings;
    statusBarItem: HTMLElement;

    collectTodos = async (): Promise<Map<string, Array<EditorPosition>>> => {
        // return a map file name -> list of match positions
        const markdownFiles = this.app.vault.getMarkdownFiles();
        const collected = new Map<string, Array<EditorPosition>>(null);

        for (const markdownFile of markdownFiles) {
            const re = new RegExp(this.settings.todoPattern, 'g');
            const contents = await this.app.vault.cachedRead(markdownFile)
            const lines = contents.split('\n');
            const positions: Array<EditorPosition> = lines.map((value, index) => ({
                line: index,
                ch: value.search(re)
            })).filter(value => value.ch != -1);
            if (positions.length > 0) {
                collected.set(markdownFile.path, positions);
            }
        }

        return collected;
    };

    randomInt = (max: number) => Math.floor(Math.random() * max);

    async onload() {
        console.log('loading plugin');

        await this.loadSettings();

        if (this.settings.showStatusBar) {
            this.statusBarItem = this.addStatusBarItem();
            this.app.workspace.on("file-open", (file) => {
                this.app.vault.cachedRead(file).then(contents => {
                    const N = [...contents.matchAll(new RegExp(this.settings.todoPattern, 'g'))].length;
                    const text = N > 0 ? N + ' to-do items' : '';
                    this.statusBarItem.setText(text);
                })
            })
        }

        this.addCommand({
            id: 'open-random-todo-file',
            name: 'Random Todo: File',
            callback: () => {
                this.collectTodos().then(collected => {
                    const collectedLinks = [...collected.keys()];

                    this.app.workspace.openLinkText(collectedLinks[this.randomInt(collectedLinks.length)], '');
                })
            }
        });

        this.addCommand({
            id: 'open-random-todo-item',
            name: 'Random Todo: Item',
            callback: () => {
                this.collectTodos().then(collected => {
                    const collectedLinks = Array<[string, EditorPosition]>();
                    for (let [path, indexes] of collected) {
                        for (let index of indexes) {
                            collectedLinks.push([path, index]);
                        }
                    }

                    const pos = this.randomInt(collectedLinks.length);
                    const [link, index] = collectedLinks[pos];
                    this.app.workspace.openLinkText(link, '').then(() => {
                        const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
                        activeView.editor.setCursor(index);
                    });
                })
            }
        });

        this.addSettingTab(new RandomTodoPluginSettingTab(this.app, this));
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

class RandomTodoPluginSettingTab extends PluginSettingTab {
    plugin: RandomTodoPlugin;

    constructor(app: App, plugin: RandomTodoPlugin) {
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
