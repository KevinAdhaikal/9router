import React from "react";
import { Switch, Route, Redirect } from "wouter";
import DashboardLayout from "@/shared/components/layouts/DashboardLayout";

// Pages
import LoginPage from "@/app/login/page";
import EndpointPageClient from "@/app/(dashboard)/dashboard/endpoint/EndpointPageClient";
import ProvidersPage from "@/app/(dashboard)/dashboard/providers/page";
import ProviderNewPage from "@/app/(dashboard)/dashboard/providers/new/page";
import ProviderDetailPage from "@/app/(dashboard)/dashboard/providers/[id]/page";
import CombosPage from "@/app/(dashboard)/dashboard/combos/page";
import CLIToolsPageClient from "@/app/(dashboard)/dashboard/cli-tools/CLIToolsPageClient";
import ToolDetailClient from "@/app/(dashboard)/dashboard/cli-tools/[toolId]/ToolDetailClient";
import ProxyPoolsPage from "@/app/(dashboard)/dashboard/proxy-pools/page";
import SkillsPage from "@/app/(dashboard)/dashboard/skills/page";
import TranslatorPage from "@/app/(dashboard)/dashboard/translator/page";
import ProfilePage from "@/app/(dashboard)/dashboard/profile/page";
import MediaProvidersWebPage from "@/app/(dashboard)/dashboard/media-providers/web/page";
import MediaProvidersKindPage from "@/app/(dashboard)/dashboard/media-providers/[kind]/page";
import MediaProvidersKindDetailPage from "@/app/(dashboard)/dashboard/media-providers/[kind]/[id]/page";
import MediaComboDetailPage from "@/app/(dashboard)/dashboard/media-providers/combo/[id]/page";
import MitmPage from "@/app/(dashboard)/dashboard/mitm/page";
import BasicChatPage from "@/app/(dashboard)/dashboard/basic-chat/page";

function DashboardWrapper({ children }) {
  return <DashboardLayout>{children}</DashboardLayout>;
}

export default function App() {
  return (
    <Switch>
      <Route path="/login" component={LoginPage} />

      {/* Dashboard Routes */}
      <Route path="/dashboard">
        <DashboardWrapper>
          <EndpointPageClient machineId="default" />
        </DashboardWrapper>
      </Route>

      <Route path="/dashboard/endpoint">
        <DashboardWrapper>
          <EndpointPageClient machineId="default" />
        </DashboardWrapper>
      </Route>

      <Route path="/dashboard/providers">
        <DashboardWrapper>
          <ProvidersPage />
        </DashboardWrapper>
      </Route>

      <Route path="/dashboard/providers/new">
        <DashboardWrapper>
          <ProviderNewPage />
        </DashboardWrapper>
      </Route>

      <Route path="/dashboard/providers/:id">
        <DashboardWrapper>
          <ProviderDetailPage />
        </DashboardWrapper>
      </Route>

      <Route path="/dashboard/combos">
        <DashboardWrapper>
          <CombosPage />
        </DashboardWrapper>
      </Route>

      <Route path="/dashboard/cli-tools">
        <DashboardWrapper>
          <CLIToolsPageClient machineId="default" />
        </DashboardWrapper>
      </Route>

      <Route path="/dashboard/cli-tools/:toolId">
        {(params) => (
          <DashboardWrapper>
            <ToolDetailClient toolId={params.toolId} machineId="default" />
          </DashboardWrapper>
        )}
      </Route>

      <Route path="/dashboard/proxy-pools">
        <DashboardWrapper>
          <ProxyPoolsPage />
        </DashboardWrapper>
      </Route>

      <Route path="/dashboard/skills">
        <DashboardWrapper>
          <SkillsPage />
        </DashboardWrapper>
      </Route>

      <Route path="/dashboard/translator">
        <DashboardWrapper>
          <TranslatorPage />
        </DashboardWrapper>
      </Route>

      <Route path="/dashboard/profile">
        <DashboardWrapper>
          <ProfilePage />
        </DashboardWrapper>
      </Route>

      <Route path="/dashboard/media-providers/web">
        <DashboardWrapper>
          <MediaProvidersWebPage />
        </DashboardWrapper>
      </Route>

      <Route path="/dashboard/media-providers/combo/:id">
        <DashboardWrapper>
          <MediaComboDetailPage />
        </DashboardWrapper>
      </Route>

      <Route path="/dashboard/media-providers/:kind/:id">
        <DashboardWrapper>
          <MediaProvidersKindDetailPage />
        </DashboardWrapper>
      </Route>

      <Route path="/dashboard/media-providers/:kind">
        <DashboardWrapper>
          <MediaProvidersKindPage />
        </DashboardWrapper>
      </Route>

      <Route path="/dashboard/mitm">
        <DashboardWrapper>
          <MitmPage />
        </DashboardWrapper>
      </Route>

      <Route path="/dashboard/basic-chat">
        <DashboardWrapper>
          <BasicChatPage />
        </DashboardWrapper>
      </Route>

      <Route path="/">
        <Redirect to="/dashboard" />
      </Route>

      {/* Fallback */}
      <Route>
        <Redirect to="/dashboard" />
      </Route>
    </Switch>
  );
}
