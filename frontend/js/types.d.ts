// Типы для внешних библиотек
declare const marked: {
    setOptions(options: any): void;
    parse(markdown: string): string;
};

declare const hljs: {
    getLanguage(lang: string): any;
    highlight(code: string, options: { language: string }): { value: string };
};
