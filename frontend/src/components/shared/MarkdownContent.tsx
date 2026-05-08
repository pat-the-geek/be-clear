import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

interface Props {
  children: string
}

export default function MarkdownContent({ children }: Props) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        h1: ({ children }) => <h1 className="text-base font-bold text-gray-900 mb-2 mt-4 first:mt-0">{children}</h1>,
        h2: ({ children }) => <h2 className="text-sm font-bold text-gray-900 mb-1.5 mt-3 first:mt-0">{children}</h2>,
        h3: ({ children }) => <h3 className="text-sm font-semibold text-gray-800 mb-1 mt-2 first:mt-0">{children}</h3>,
        p: ({ children }) => <p className="text-sm text-gray-700 mb-2 leading-relaxed last:mb-0">{children}</p>,
        ul: ({ children }) => <ul className="text-sm list-disc list-inside space-y-1 mb-2 text-gray-700">{children}</ul>,
        ol: ({ children }) => <ol className="text-sm list-decimal list-inside space-y-1 mb-2 text-gray-700">{children}</ol>,
        li: ({ children }) => <li className="text-sm text-gray-700">{children}</li>,
        strong: ({ children }) => <strong className="font-semibold text-gray-900">{children}</strong>,
        em: ({ children }) => <em className="italic text-gray-600">{children}</em>,
        code: ({ className, children }) =>
          className
            ? <code className={className}>{children}</code>
            : <code className="font-mono text-xs bg-gray-100 text-gray-800 px-1 py-0.5 rounded">{children}</code>,
        pre: ({ children }) => (
          <pre className="bg-gray-800 text-green-300 text-xs rounded-lg p-3 overflow-x-auto my-2 font-mono">
            {children}
          </pre>
        ),
        blockquote: ({ children }) => (
          <blockquote className="border-l-2 border-gray-300 pl-3 text-gray-500 italic text-sm my-2">
            {children}
          </blockquote>
        ),
        a: ({ href, children }) => (
          <a href={href} target="_blank" rel="noopener noreferrer" className="text-blue-600 underline hover:text-blue-700">
            {children}
          </a>
        ),
        table: ({ children }) => (
          <div className="overflow-x-auto my-2">
            <table className="w-full text-sm border-collapse">{children}</table>
          </div>
        ),
        thead: ({ children }) => <thead className="bg-gray-100">{children}</thead>,
        tr: ({ children }) => <tr className="border-b border-gray-200">{children}</tr>,
        th: ({ children }) => <th className="text-left px-3 py-2 text-xs font-semibold text-gray-600 uppercase">{children}</th>,
        td: ({ children }) => <td className="px-3 py-2 text-gray-700">{children}</td>,
        hr: () => <hr className="my-3 border-gray-200" />,
      }}
    >
      {children}
    </ReactMarkdown>
  )
}
