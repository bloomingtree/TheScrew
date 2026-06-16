import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Play, Pause, Trash2, Clock, RefreshCw } from 'lucide-react';
import { useSchedulerStore, PRESET_TEMPLATES, SchedulerJob } from '../../../store/schedulerStore';

// 格式化时间
const formatTime = (ms: number | null | undefined): string => {
  if (!ms) return '-';
  const d = new Date(ms);
  return d.toLocaleString('zh-CN', {
    timeZone: 'Asia/Shanghai',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
};

// 格式化 cron 表达式为可读文本
const formatSchedule = (schedule: any): string => {
  if (!schedule) return '未知';
  if (schedule.kind === 'cron' && schedule.expr) {
    const parts = schedule.expr.split(/\s+/);
    const [min, hour, day, month, dow] = parts;
    if (day === '*' && month === '*' && dow === '*') return `每天 ${hour}:${min}`;
    if (day === '*' && month === '*' && dow === '0') return `每周日 ${hour}:${min}`;
    if (day === '*' && month === '*' && dow === '1') return `每周一 ${hour}:${min}`;
    if (day === '*' && month === '*' && dow === '5') return `每周五 ${hour}:${min}`;
    return schedule.expr;
  }
  if (schedule.kind === 'every' && schedule.every_ms) {
    const hours = schedule.every_ms / 3600000;
    if (hours >= 1) return `每 ${hours} 小时`;
    const mins = schedule.every_ms / 60000;
    return `每 ${mins} 分钟`;
  }
  if (schedule.kind === 'at' && schedule.at_ms) {
    return `定时 ${formatTime(schedule.at_ms)}`;
  }
  return '未知';
};

// 单个任务卡片
const JobCard: React.FC<{
  job: SchedulerJob;
  onToggle: (id: string, enabled: boolean) => void;
  onDelete: (id: string) => void;
  onRun: (id: string) => void;
}> = ({ job, onToggle, onDelete, onRun }) => {
  // 兼容旧数据：target 不存在时，根据 kind 字段推断（message→user，tool→agent），默认 user
  const target: 'user' | 'agent' =
    job.payload?.target
      ?? (job.payload?.kind === 'tool' ? 'agent' : 'user');

  const isUserReminder = target === 'user';

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className={`p-3 rounded-lg border ${
        job.enabled
          ? isUserReminder
            ? 'bg-amber-50/40 border-amber-200/60'
            : 'bg-white border-blue-200/60'
          : 'bg-gray-50 border-gray-200/60 opacity-70'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2 min-w-0">
          <span className="text-base shrink-0 mt-0.5">
            {job.icon || (isUserReminder ? '🔔' : '🤖')}
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <h4 className="text-sm font-medium text-gray-800 truncate">{job.name}</h4>
              <span
                className={`shrink-0 px-1.5 py-0.5 text-[9px] rounded-full font-medium ${
                  isUserReminder
                    ? 'bg-amber-100 text-amber-700'
                    : 'bg-blue-100 text-blue-700'
                }`}
                title={isUserReminder ? '提醒用户型：到点通知你' : 'Agent 自驱动型：到点自动执行'}
              >
                {isUserReminder ? '提醒我' : 'Agent'}
              </span>
            </div>
            <p className="text-xs text-gray-500 mt-0.5">
              <Clock size={10} className="inline mr-1" />
              {formatSchedule(job.schedule)}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {job.enabled && (
            <button
              onClick={() => onRun(job.id)}
              className="p-1 rounded hover:bg-green-50 text-green-500 hover:text-green-700 transition-colors"
              title="立即执行"
            >
              <Play size={14} />
            </button>
          )}
          <button
            onClick={() => onToggle(job.id, !job.enabled)}
            className={`p-1 rounded transition-colors ${
              job.enabled
                ? 'hover:bg-orange-50 text-orange-500 hover:text-orange-700'
                : 'hover:bg-blue-50 text-blue-500 hover:text-blue-700'
            }`}
            title={job.enabled ? '暂停' : '启用'}
          >
            {job.enabled ? <Pause size={14} /> : <Play size={14} />}
          </button>
          <button
            onClick={() => onDelete(job.id)}
            className="p-1 rounded hover:bg-red-50 text-red-400 hover:text-red-600 transition-colors"
            title="删除"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      {/* 状态信息 */}
      <div className="mt-2 flex items-center gap-3 text-[10px] text-gray-400">
        {job.enabled ? (
          <span className="flex items-center gap-1 text-green-600">
            <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
            活跃
          </span>
        ) : (
          <span className="text-gray-400">已暂停</span>
        )}
        {job.state.last_run_at_ms && (
          <span>上次: {formatTime(job.state.last_run_at_ms)}</span>
        )}
        {job.state.next_run_at_ms && job.enabled && (
          <span>下次: {formatTime(job.state.next_run_at_ms)}</span>
        )}
      </div>

      {/* 执行指令预览 */}
      {job.payload?.message && (
        <p className="mt-1.5 text-[10px] text-gray-400 line-clamp-2 border-t border-gray-100 pt-1.5">
          {job.payload.message}
        </p>
      )}
    </motion.div>
  );
};

// 新建任务对话框
const CreateJobDialog: React.FC<{
  onClose: () => void;
  onSubmit: (name: string, schedule: any, message: string, options?: any) => void;
}> = ({ onClose, onSubmit }) => {
  const [target, setTarget] = useState<'user' | 'agent'>('user');
  const [name, setName] = useState('');
  const [scheduleType, setScheduleType] = useState<'daily' | 'weekly' | 'cron'>('daily');
  const [time, setTime] = useState('23:00');
  const [weekday, setWeekday] = useState('1');
  const [cronExpr, setCronExpr] = useState('0 23 * * *');
  const [message, setMessage] = useState('');
  const [notifyOnComplete, setNotifyOnComplete] = useState(true);

  const handleSubmit = () => {
    if (!name.trim() || !message.trim()) return;

    let schedule;
    switch (scheduleType) {
      case 'daily': {
        const [h, m] = time.split(':');
        schedule = { kind: 'cron', expr: `${m} ${h} * * *` };
        break;
      }
      case 'weekly': {
        const [h, m] = time.split(':');
        schedule = { kind: 'cron', expr: `${m} ${h} * * ${weekday}` };
        break;
      }
      case 'cron': {
        schedule = { kind: 'cron', expr: cronExpr };
        break;
      }
    }

    onSubmit(name, schedule, message, {
      target,
      notifyOnComplete,
      icon: target === 'user' ? '🔔' : '🤖',
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
      <div className="bg-white rounded-xl shadow-xl border border-gray-200 w-[440px] max-w-[90vw] max-h-[85vh] overflow-y-auto">
        <div className="px-5 py-4 border-b border-gray-100">
          <h3 className="text-base font-semibold text-gray-800">新建定时任务</h3>
        </div>

        <div className="px-5 py-4 space-y-4">
          {/* 任务类型 */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">任务类型</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setTarget('user')}
                className={`p-2.5 rounded-lg border text-left transition-all ${
                  target === 'user'
                    ? 'bg-amber-50 border-amber-300'
                    : 'border-gray-200 hover:bg-gray-50'
                }`}
              >
                <div className="flex items-center gap-1.5">
                  <span className="text-base">🔔</span>
                  <span className="text-sm font-medium text-gray-800">提醒我</span>
                </div>
                <p className="text-[10px] text-gray-500 mt-0.5">到点通知你该做的事</p>
              </button>
              <button
                onClick={() => setTarget('agent')}
                className={`p-2.5 rounded-lg border text-left transition-all ${
                  target === 'agent'
                    ? 'bg-blue-50 border-blue-300'
                    : 'border-gray-200 hover:bg-gray-50'
                }`}
              >
                <div className="flex items-center gap-1.5">
                  <span className="text-base">🤖</span>
                  <span className="text-sm font-medium text-gray-800">Agent 自驱</span>
                </div>
                <p className="text-[10px] text-gray-500 mt-0.5">到点让 Agent 自动执行</p>
              </button>
            </div>
          </div>

          {/* 任务名称 */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">任务名称</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={target === 'user' ? '例如：下班提醒' : '例如：每日工作总结'}
              className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 focus:border-blue-400 focus:ring-1 focus:ring-blue-200 outline-none"
            />
          </div>

          {/* 触发方式 */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">触发方式</label>
            <div className="flex gap-2">
              {[
                { key: 'daily', label: '每天' },
                { key: 'weekly', label: '每周' },
                { key: 'cron', label: 'Cron' },
              ].map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => setScheduleType(key as any)}
                  className={`px-3 py-1.5 text-xs rounded-lg border transition-all ${
                    scheduleType === key
                      ? 'bg-blue-50 border-blue-300 text-blue-700'
                      : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* 时间设置 */}
          <div className="flex items-center gap-2">
            {scheduleType !== 'cron' ? (
              <>
                <span className="text-xs text-gray-500">时间</span>
                <input
                  type="time"
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                  className="px-3 py-1.5 text-sm rounded-lg border border-gray-200 focus:border-blue-400 outline-none"
                />
                {scheduleType === 'weekly' && (
                  <select
                    value={weekday}
                    onChange={(e) => setWeekday(e.target.value)}
                    className="px-3 py-1.5 text-sm rounded-lg border border-gray-200 focus:border-blue-400 outline-none"
                  >
                    <option value="1">周一</option>
                    <option value="2">周二</option>
                    <option value="3">周三</option>
                    <option value="4">周四</option>
                    <option value="5">周五</option>
                    <option value="6">周六</option>
                    <option value="0">周日</option>
                  </select>
                )}
              </>
            ) : (
              <input
                type="text"
                value={cronExpr}
                onChange={(e) => setCronExpr(e.target.value)}
                placeholder="分 时 日 月 星期"
                className="flex-1 px-3 py-1.5 text-sm rounded-lg border border-gray-200 focus:border-blue-400 outline-none font-mono"
              />
            )}
          </div>

          {/* 执行内容 */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              {target === 'user' ? '提醒内容' : 'Agent 指令'}
            </label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder={
                target === 'user'
                  ? '例如：该下班了，记得整理今天的工作'
                  : '描述 Agent 应执行的任务，例如：总结今日所有对话，提取关键信息到工作记忆'
              }
              rows={3}
              className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 focus:border-blue-400 focus:ring-1 focus:ring-blue-200 outline-none resize-none"
            />
          </div>

          {/* 快速模板 */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">快速模板</label>
            <div className="space-y-1.5">
              {PRESET_TEMPLATES
                .filter(tpl => (tpl as any).target === target)
                .map((tpl, i) => (
                  <button
                    key={i}
                    onClick={() => {
                      setName(tpl.name);
                      setMessage(tpl.message);
                      if (tpl.schedule.kind === 'cron' && tpl.schedule.expr) {
                        setCronExpr(tpl.schedule.expr);
                        setScheduleType('cron');
                      } else if (tpl.schedule.kind === 'every' && tpl.schedule.every_ms) {
                        // 把 every 转成简易 cron（每小时）让用户看到时间字段
                        const hours = Math.max(1, Math.round(tpl.schedule.every_ms / 3600000));
                        setCronExpr(`0 */${hours} * * *`);
                        setScheduleType('cron');
                      }
                    }}
                    className="w-full flex items-center gap-2 p-2 rounded-lg border border-gray-200 hover:border-blue-200 hover:bg-blue-50/50 transition-all text-left"
                  >
                    <span>{tpl.icon}</span>
                    <div>
                      <p className="text-xs font-medium text-gray-700">{tpl.name}</p>
                      <p className="text-[10px] text-gray-400">{tpl.description}</p>
                    </div>
                  </button>
                ))}
            </div>
          </div>

          {/* 选项 */}
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={notifyOnComplete}
              onChange={(e) => setNotifyOnComplete(e.target.checked)}
              className="rounded border-gray-300"
            />
            <label className="text-xs text-gray-600">执行后通知</label>
          </div>
        </div>

        {/* 按钮 */}
        <div className="px-5 py-3 border-t border-gray-100 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
          >
            取消
          </button>
          <button
            onClick={handleSubmit}
            disabled={!name.trim() || !message.trim()}
            className="px-4 py-2 text-sm rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            创建任务
          </button>
        </div>
      </div>
    </div>
  );
};

// ==================== 主面板 ====================

const SchedulerTab: React.FC = () => {
  const {
    jobs,
    loading,
    createDialogOpen,
    setCreateDialogOpen,
    loadJobs,
    createJob,
    deleteJob,
    toggleJob,
    runJob,
  } = useSchedulerStore();

  useEffect(() => {
    loadJobs();
  }, []);

  const activeJobs = jobs.filter(j => j.enabled);
  const inactiveJobs = jobs.filter(j => !j.enabled);

  return (
    <div className="h-full flex flex-col">
      {/* 头部 */}
      <div className="px-4 py-3 flex items-center justify-between border-b border-gray-100">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-gray-800">定时任务</h3>
          <span className="text-[10px] text-gray-400">{jobs.length} 个</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => loadJobs()}
            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
            title="刷新"
          >
            <RefreshCw size={14} />
          </button>
          <button
            onClick={() => setCreateDialogOpen(true)}
            className="flex items-center gap-1 px-2.5 py-1.5 text-xs rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors"
          >
            <Plus size={12} />
            新建
          </button>
        </div>
      </div>

      {/* 任务列表 */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {loading ? (
          <div className="flex items-center justify-center py-8 text-gray-400 text-sm">
            加载中...
          </div>
        ) : jobs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-gray-400">
            <Clock size={32} className="mb-3 opacity-50" />
            <p className="text-sm">暂无定时任务</p>
            <p className="text-xs mt-1">点击「新建」创建你的第一个任务</p>
          </div>
        ) : (
          <>
            {/* 活跃任务 */}
            {activeJobs.length > 0 && (
              <div>
                <h4 className="text-xs font-medium text-gray-500 mb-2 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                  活跃任务 ({activeJobs.length})
                </h4>
                <div className="space-y-2">
                  <AnimatePresence>
                    {activeJobs.map(job => (
                      <JobCard
                        key={job.id}
                        job={job}
                        onToggle={toggleJob}
                        onDelete={deleteJob}
                        onRun={runJob}
                      />
                    ))}
                  </AnimatePresence>
                </div>
              </div>
            )}

            {/* 暂停任务 */}
            {inactiveJobs.length > 0 && (
              <div>
                <h4 className="text-xs font-medium text-gray-500 mb-2">暂停的任务 ({inactiveJobs.length})</h4>
                <div className="space-y-2">
                  <AnimatePresence>
                    {inactiveJobs.map(job => (
                      <JobCard
                        key={job.id}
                        job={job}
                        onToggle={toggleJob}
                        onDelete={deleteJob}
                        onRun={runJob}
                      />
                    ))}
                  </AnimatePresence>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* 新建对话框 */}
      {createDialogOpen && (
        <CreateJobDialog
          onClose={() => setCreateDialogOpen(false)}
          onSubmit={createJob}
        />
      )}
    </div>
  );
};

export default SchedulerTab;
