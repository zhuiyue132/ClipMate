<script setup lang="ts"></script>

<template>
  <div class="app">
    <header class="app-header">
      <div class="search-box">
        <input type="text" placeholder="搜索剪贴板历史..." class="search-input" />
      </div>
      <button class="more-btn" title="更多">···</button>
    </header>
    <main class="app-content">
      <div class="empty-state">
        <p>ClipMate 已就绪</p>
        <p class="empty-hint">复制内容后将自动显示在这里</p>
      </div>
    </main>
  </div>
</template>

<style>
:root {
  --bg-primary: rgba(30, 30, 30, 0.95);
  --bg-card: rgba(50, 50, 50, 0.8);
  --text-primary: #ffffff;
  --text-secondary: rgba(255, 255, 255, 0.6);
  --border-color: rgba(255, 255, 255, 0.1);
  --accent-color: #007aff;
}

@media (prefers-color-scheme: light) {
  :root {
    --bg-primary: rgba(245, 245, 245, 0.95);
    --bg-card: rgba(255, 255, 255, 0.9);
    --text-primary: #1d1d1f;
    --text-secondary: rgba(0, 0, 0, 0.5);
    --border-color: rgba(0, 0, 0, 0.1);
  }
}

* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Helvetica Neue', sans-serif;
  background: var(--bg-primary);
  color: var(--text-primary);
  overflow: hidden;
  user-select: none;
  -webkit-app-region: drag;
}

.app {
  display: flex;
  flex-direction: column;
  height: 100vh;
}

.app-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border-color);
  -webkit-app-region: drag;
}

.search-box {
  flex: 1;
  -webkit-app-region: no-drag;
}

.search-input {
  width: 100%;
  padding: 6px 12px;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  background: var(--bg-card);
  color: var(--text-primary);
  font-size: 13px;
  outline: none;
}

.search-input:focus {
  border-color: var(--accent-color);
}

.more-btn {
  -webkit-app-region: no-drag;
  background: none;
  border: none;
  color: var(--text-secondary);
  font-size: 16px;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 4px;
}

.more-btn:hover {
  background: var(--bg-card);
}

.app-content {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  -webkit-app-region: no-drag;
}

.empty-state {
  text-align: center;
}

.empty-state p {
  font-size: 15px;
  color: var(--text-secondary);
}

.empty-hint {
  margin-top: 4px;
  font-size: 12px !important;
}
</style>
