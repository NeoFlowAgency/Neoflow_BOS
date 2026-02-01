import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://vnjhzkplwuqvuhvfeemh.supabase.co'
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZuamh6a3Bsd3VxdnVodmZlZW1oIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk2NTYxODgsImV4cCI6MjA4NTIzMjE4OH0.7WxJ63WTDgq9YJsNDorlhATuocT5L7q_HTyTERkNEoc'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
