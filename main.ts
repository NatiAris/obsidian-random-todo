import {App, EditorPosition, MarkdownView, Plugin, PluginSettingTab, Setting, TFile} from 'obsidian';

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
    todoPattern: RegExp;
    // file name -> (last updated, positions of todos)
    fileCache = new Map<string, [number, Array<EditorPosition>]>(null);

    getRandomFileWithTodo = async (): Promise<string> => {
        const markdownFiles = this.app.vault.getMarkdownFiles();
        markdownFiles.shuffle();
        for (const markdownFile of markdownFiles) {
            const positions = await this.collectTodosFromFile(markdownFile);
            if (positions.length > 0) {
                return markdownFile.path;
            }
        }
    }

    getRandomTodoItem = async (): Promise<[string, EditorPosition]> => {
        const markdownFiles = this.app.vault.getMarkdownFiles();
        const collectedLinks = Array<[string, EditorPosition]>();
        for (const markdownFile of markdownFiles) {
            const positions = await this.collectTodosFromFile(markdownFile);
            for (const position of positions) {
                collectedLinks.push([markdownFile.path, position])
            }
        }

        const pos = this.randomInt(collectedLinks.length);
        return collectedLinks[pos];
    }

    collectTodosFromFile = async (file: TFile): Promise<Array<EditorPosition>> => {
        const [mtime, cachedPositions] = this.fileCache.get(file.path) || [0, null];
        if (!cachedPositions && mtime !== file.stat.mtime) {
            const contents = await this.app.vault.cachedRead(file);
            const lines = contents.split('\n');
            const positions: Array<EditorPosition> = lines.map((value, index) => ({
                line: index,
                ch: value.search(this.todoPattern)
            })).filter(value => value.ch != -1);
            this.fileCache.set(file.path, [file.stat.mtime, positions])
            return positions;
        }
        return cachedPositions;
    }

    randomInt = (max: number) => Math.floor(Math.random() * max);

    async onload() {
        console.log('loading plugin');

        await this.loadSettings();

        this.todoPattern = new RegExp(this.settings.todoPattern, 'g');

        if (this.settings.showStatusBar) {
            this.statusBarItem = this.addStatusBarItem();
            this.app.workspace.on("file-open", (file) => {
                this.app.vault.cachedRead(file).then(contents => {
                    const N = [...contents.matchAll(this.todoPattern)].length;
                    const text = N > 0 ? N + ' to-do items' : '';
                    this.statusBarItem.setText(text);
                })
            });
            this.app.vault.on("modify", (file: TFile) => {
                this.app.vault.cachedRead(file).then(contents => {
                    const N = [...contents.matchAll(this.todoPattern)].length;
                    const text = N > 0 ? N + ' to-do items' : '';
                    this.statusBarItem.setText(text);
                })
            });
        }

        this.addCommand({
            id: 'open-random-todo-file',
            name: 'Random Todo: File',
            callback: () => {
                this.getRandomFileWithTodo().then(link => {
                    this.app.workspace.openLinkText(link, '');
                })
            }
        });

        this.addCommand({
            id: 'open-random-todo-item',
            name: 'Random Todo: Item',
            callback: () => {
                this.getRandomTodoItem().then(([link, position]) => {
                    this.app.workspace.openLinkText(link, '').then(() => {
                        this.app.workspace.getActiveViewOfType(MarkdownView).editor.setCursor(position);
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
                    this.plugin.todoPattern = new RegExp(value, 'g');
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
