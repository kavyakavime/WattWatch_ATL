import './Page.css'

export default function SchedulerPage() {
  return (
    <article className="page">
      <h1 className="page__title">Green Scheduler</h1>
      <p className="page__desc">
        A planner that shifts flexible loads (EV charging, appliances, compute)
        toward cleaner grid hours using forecast carbon intensity and simple
        user constraints.
      </p>
    </article>
  )
}
