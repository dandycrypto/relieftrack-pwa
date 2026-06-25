'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Loader2, Send, BrainCircuit, X } from 'lucide-react'

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

interface TaxContext {
  taxYear: string
  grossIncome: number
  totalClaimed: number
  totalPossible: number
  estimatedSavings: number
  reliefTotals: Record<string, number>
  profileName: string
  maritalStatus: string
  childrenUnder18: number
  childrenEducation: number
  hasParents: boolean
  isFirstHomeOwner: boolean
  recordCount: number
  pcbPaid?: number
  chargeableIncome?: number
}

interface TaxAssistantProps {
  open: boolean
  onClose: () => void
  context: TaxContext
}

const STARTERS = [
  'What relief am I missing?',
  'How much tax will I owe?',
  'Explain lifestyle relief',
  'When is the filing deadline?',
]

export default function TaxAssistant({ open, onClose, context }: TaxAssistantProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (open && messages.length === 0) {
      setMessages([{
        role: 'assistant',
        content: `Hi ${context.profileName || 'there'}! I'm your AI tax assistant for YA ${context.taxYear}. You've claimed RM ${context.totalClaimed.toLocaleString()} of RM ${context.totalPossible.toLocaleString()} possible reliefs. How can I help you maximise your tax savings?`,
      }])
    }
  }, [open, context.profileName, context.taxYear, context.totalClaimed, context.totalPossible, messages.length])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const sendMessage = useCallback(async (text: string) => {
    const trimmed = text.trim()
    if (!trimmed || loading) return

    const userMsg: ChatMessage = { role: 'user', content: trimmed }
    const newMessages = [...messages, userMsg]
    setMessages(newMessages)
    setInput('')
    setLoading(true)

    try {
      const res = await fetch('/api/ai-chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ messages: newMessages, context }),
      })
      const data = await res.json()
      setMessages((prev) => [...prev, {
        role: 'assistant',
        content: data.reply || 'Sorry, I encountered an error. Please try again.',
      }])
    } catch {
      setMessages((prev) => [...prev, {
        role: 'assistant',
        content: 'Network error. Please check your connection and try again.',
      }])
    } finally {
      setLoading(false)
    }
  }, [messages, loading, context])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage(input)
    }
  }

  const resetChat = () => {
    setMessages([])
    setInput('')
  }

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent side="right" className="w-full sm:w-[420px] p-0 flex flex-col">
        <SheetHeader className="px-4 py-3 border-b bg-gradient-to-r from-purple-600 to-violet-600 text-white">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <BrainCircuit className="w-5 h-5" />
              <SheetTitle className="text-white text-base">AI Tax Assistant</SheetTitle>
              <Badge className="bg-white/20 text-white border-0 text-xs">YA {context.taxYear}</Badge>
            </div>
            <button onClick={onClose} className="text-white/80 hover:text-white">
              <X className="w-4 h-4" />
            </button>
          </div>
          <p className="text-xs text-purple-100 mt-1">Ask anything about your tax reliefs</p>
        </SheetHeader>

        {/* Chat Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
          {messages.map((msg, i) => (
            <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              {msg.role === 'assistant' && (
                <div className="w-7 h-7 rounded-full bg-purple-100 flex items-center justify-center mr-2 mt-1 shrink-0 text-sm">
                  🤖
                </div>
              )}
              <div
                className={`max-w-[82%] rounded-2xl px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap ${
                  msg.role === 'user'
                    ? 'bg-purple-600 text-white rounded-br-sm'
                    : 'bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-bl-sm'
                }`}
              >
                {msg.content}
              </div>
            </div>
          ))}

          {loading && (
            <div className="flex justify-start">
              <div className="w-7 h-7 rounded-full bg-purple-100 flex items-center justify-center mr-2 shrink-0 text-sm">
                🤖
              </div>
              <div className="bg-gray-100 dark:bg-gray-800 rounded-2xl rounded-bl-sm px-3 py-2">
                <Loader2 className="w-4 h-4 animate-spin text-purple-500" />
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {/* Starter Chips (only when no user messages) */}
        {messages.length <= 1 && (
          <div className="px-4 pb-2 flex flex-wrap gap-1.5">
            {STARTERS.map((s) => (
              <button
                key={s}
                onClick={() => sendMessage(s)}
                className="text-xs px-3 py-1.5 rounded-full border border-purple-200 text-purple-700 dark:text-purple-300 dark:border-purple-800 hover:bg-purple-50 dark:hover:bg-purple-900/30 transition-colors"
              >
                {s}
              </button>
            ))}
          </div>
        )}

        {/* Clear chat link */}
        {messages.length > 1 && (
          <div className="px-4 pb-1 text-center">
            <button onClick={resetChat} className="text-xs text-gray-400 hover:text-gray-600">
              Clear conversation
            </button>
          </div>
        )}

        {/* Input */}
        <div className="px-4 pb-4 pt-2 border-t flex gap-2 items-end">
          <Textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask about your tax reliefs…"
            className="resize-none min-h-[40px] max-h-[100px] text-sm"
            rows={1}
            disabled={loading}
          />
          <Button
            size="sm"
            onClick={() => sendMessage(input)}
            disabled={!input.trim() || loading}
            className="bg-purple-600 hover:bg-purple-700 h-10 w-10 p-0 shrink-0"
          >
            <Send className="w-4 h-4" />
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  )
}
