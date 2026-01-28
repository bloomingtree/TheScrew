import React from 'react';
import { User, Bot, Copy, Trash2 } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { tomorrow } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { Message } from '../../types';
import { useChatStore } from '../../store/chatStore';

interface MessageItemProps {
  message: Message;
  index: number;
}

const MessageItem: React.FC<MessageItemProps> = ({ message, index }) => {
  const { deleteMessage } = useChatStore();
  const isUser = message.role === 'user';

  const handleCopy = () => {
    navigator.clipboard.writeText(message.content);
  };

  const handleDelete = () => {
    if (window.confirm('确定要删除这条消息吗？')) {
      deleteMessage(index);
    }
  };

  return (
    <div className={`flex gap-3 ${isUser ? 'justify-end' : 'justify-start'}`}>
      {!isUser && (
        <div className="flex-shrink-0 w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center">
          <Bot size={18} className="text-white" />
        </div>
      )}

      <div className={`max-w-[70%] ${isUser ? 'order-2' : ''}`}>
        <div className={`rounded-lg p-4 ${
          isUser
            ? 'bg-blue-600 text-white'
            : 'bg-white border border-gray-200 shadow-sm'
        }`}>
          {message.images && message.images.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-2">
              {message.images.map((image, idx) => (
                <img
                  key={idx}
                  src={image}
                  alt="附件"
                  className="max-w-[200px] rounded"
                />
              ))}
            </div>
          )}

          <div className={isUser ? 'text-white' : 'text-gray-800'}>
            <ReactMarkdown
              components={{
                code({ node, inline, className, children, ...props }: any) {
                  const match = /language-(\w+)/.exec(className || '');
                  return !inline && match ? (
                    <SyntaxHighlighter
                      style={tomorrow}
                      language={match[1]}
                      PreTag="div"
                      {...props}
                    >
                      {String(children).replace(/\n$/, '')}
                    </SyntaxHighlighter>
                  ) : (
                    <code
                      className={`${className} px-1.5 py-0.5 rounded bg-gray-100 text-sm ${
                        isUser ? 'bg-blue-700 text-white' : 'bg-gray-100 text-gray-800'
                      }`}
                      {...props}
                    >
                      {children}
                    </code>
                  );
                },
                pre({ children }: any) {
                  return <div className="overflow-x-auto rounded-lg">{children}</div>;
                },
              }}
            >
              {message.content}
            </ReactMarkdown>
          </div>
        </div>

        <div className={`flex gap-2 mt-1 ${isUser ? 'justify-end' : 'justify-start'} text-gray-400 text-sm`}>
          <span>{new Date(message.timestamp).toLocaleTimeString()}</span>
          <button
            onClick={handleCopy}
            className="hover:text-blue-600 transition-colors"
            title="复制"
          >
            <Copy size={14} />
          </button>
          <button
            onClick={handleDelete}
            className="hover:text-red-600 transition-colors"
            title="删除"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      {isUser && (
        <div className="flex-shrink-0 w-8 h-8 bg-gray-600 rounded-full flex items-center justify-center">
          <User size={18} className="text-white" />
        </div>
      )}
    </div>
  );
};

export default MessageItem;
