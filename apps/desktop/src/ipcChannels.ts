export const IPC = {
  CT_TERMINAL_OPEN: 'ct:terminal:open',
  CT_TERMINAL_WRITE: 'ct:terminal:write',
  CT_TERMINAL_RESIZE: 'ct:terminal:resize',
  CT_TERMINAL_CLOSE: 'ct:terminal:close',
  CT_TERMINAL_DATA: 'ct:terminal:data',
  CT_TERMINAL_EXIT: 'ct:terminal:exit',
  CT_WORKTREE_CREATE: 'ct:worktree:create',
  CT_WORKTREE_DELETE: 'ct:worktree:delete',
  CT_WORKTREE_LIST: 'ct:worktree:list',
  CT_PROJECT_ADD: 'ct:project:add',
  CT_PROJECT_LIST: 'ct:project:list',
  CT_GET_BACKEND_URL: 'ct:get-backend-url',
  CT_PICK_FOLDER: 'ct:pick-folder',
  CT_CONFIRM: 'ct:confirm',
} as const;

export type IpcChannel = (typeof IPC)[keyof typeof IPC];
