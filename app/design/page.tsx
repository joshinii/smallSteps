'use client';

export default function DesignPage() {
    const colors = [
        { name: 'Background', var: 'bg-background', text: 'text-foreground', border: 'border-border' },
        { name: 'Foreground', var: 'bg-foreground', text: 'text-background', border: '' },
        { name: 'Accent', var: 'bg-accent', text: 'text-white', border: '' },
        { name: 'Accent Hover', var: 'bg-accent-hover', text: 'text-white', border: '' },
        { name: 'Muted', var: 'bg-muted', text: 'text-white', border: '' },
        { name: 'Border', var: 'bg-border', text: 'text-foreground', border: '' },
    ];

    return (
        <div className="max-w-4xl mx-auto px-6 py-12 animate-fadeIn">
            <header className="mb-12">
                <h1 className="text-4xl font-light text-foreground mb-3">Design System</h1>
                <p className="text-muted text-lg">Reviewing the calm color palette and typography.</p>
            </header>

            <section className="mb-16">
                <h2 className="text-2xl font-light mb-6">Color Palette</h2>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                    {colors.map((c) => (
                        <div key={c.name} className="space-y-3">
                            <div className={`h-24 rounded-2xl shadow-sm flex items-center justify-center border ${c.var} ${c.text} ${c.border || 'border-transparent'}`}>
                                <span className="font-medium">{c.name}</span>
                            </div>
                            <p className="text-xs text-muted font-mono">{c.var}</p>
                        </div>
                    ))}
                </div>
            </section>

            <section className="mb-16">
                <h2 className="text-2xl font-light mb-6">Typography</h2>
                <div className="space-y-6 border p-8 rounded-2xl bg-white">
                    <div>
                        <h1 className="text-4xl font-light text-foreground">Heading 1 - Calm & Light</h1>
                        <p className="text-sm text-muted mt-1">text-4xl font-light</p>
                    </div>
                    <div>
                        <h2 className="text-2xl font-light text-foreground">Heading 2 - Section Title</h2>
                        <p className="text-sm text-muted mt-1">text-2xl font-light</p>
                    </div>
                    <div>
                        <h3 className="text-xl font-medium text-foreground">Heading 3 - Component Title</h3>
                        <p className="text-sm text-muted mt-1">text-xl font-medium</p>
                    </div>
                    <div>
                        <p className="text-lg text-foreground">Body Large - Used for introductions and lead text.</p>
                        <p className="text-sm text-muted mt-1">text-lg</p>
                    </div>
                    <div>
                        <p className="text-base text-foreground">Body Default - standard reading text. The quick brown fox jumps over the lazy dog.</p>
                        <p className="text-sm text-muted mt-1">text-base</p>
                    </div>
                    <div>
                        <p className="text-sm text-muted">Muted Text - Used for secondary information and metadata.</p>
                        <p className="text-sm text-muted mt-1">text-muted</p>
                    </div>
                </div>
            </section>

            <section>
                <h2 className="text-2xl font-light mb-6">Components</h2>
                <div className="flex flex-wrap gap-4 p-8 border rounded-2xl bg-white">
                    <button className="px-6 py-2 bg-accent text-white rounded-xl hover:bg-accent-hover transition-colors font-medium">
                        Primary Action
                    </button>
                    <button className="px-6 py-2 bg-white border border-border text-foreground rounded-xl hover:bg-gray-50 transition-colors font-medium">
                        Secondary Action
                    </button>
                    <input
                        type="text"
                        placeholder="Input field..."
                        className="px-4 py-2 bg-white border border-border rounded-xl focus:border-accent focus:outline-none"
                    />
                </div>
            </section>
        </div>
    );
}
