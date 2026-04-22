import { StrictMode, Suspense, lazy } from "react";
import { createRoot } from "react-dom/client";
import { HashRouter, Routes, Route } from "react-router-dom";
import App from "./App";
import "./index.css";

const HomePage = lazy(() => import("./pages/HomePage"));
const AccountsPage = lazy(() => import("./pages/AccountsPage"));
const PatientDashboard = lazy(() => import("./pages/PatientDashboard"));
const MedicSign = lazy(() => import("./pages/MedicSign"));
const ResearcherBuy = lazy(() => import("./pages/ResearcherBuy"));
const ShareWithDoctor = lazy(() => import("./pages/ShareWithDoctor"));
const DoctorInbox = lazy(() => import("./pages/DoctorInbox"));
const GovernanceDashboard = lazy(() => import("./pages/GovernanceDashboard"));

const routeFallback = (
	<div className="card animate-pulse">
		<div className="h-4 w-32 rounded bg-white/[0.06]" />
		<div className="mt-3 h-3 w-48 rounded bg-white/[0.04]" />
	</div>
);

createRoot(document.getElementById("root")!).render(
	<StrictMode>
		<HashRouter>
			<Routes>
				<Route element={<App />}>
					<Route
						index
						element={
							<Suspense fallback={routeFallback}>
								<HomePage />
							</Suspense>
						}
					/>
					<Route
						path="accounts"
						element={
							<Suspense fallback={routeFallback}>
								<AccountsPage />
							</Suspense>
						}
					/>
					<Route
						path="patient"
						element={
							<Suspense fallback={routeFallback}>
								<PatientDashboard />
							</Suspense>
						}
					/>
					<Route
						path="medic"
						element={
							<Suspense fallback={routeFallback}>
								<MedicSign />
							</Suspense>
						}
					/>
					<Route
						path="researcher"
						element={
							<Suspense fallback={routeFallback}>
								<ResearcherBuy />
							</Suspense>
						}
					/>
					<Route
						path="share"
						element={
							<Suspense fallback={routeFallback}>
								<ShareWithDoctor />
							</Suspense>
						}
					/>
					<Route
						path="inbox"
						element={
							<Suspense fallback={routeFallback}>
								<DoctorInbox />
							</Suspense>
						}
					/>
					<Route
						path="governance"
						element={
							<Suspense fallback={routeFallback}>
								<GovernanceDashboard />
							</Suspense>
						}
					/>
				</Route>
			</Routes>
		</HashRouter>
	</StrictMode>,
);
