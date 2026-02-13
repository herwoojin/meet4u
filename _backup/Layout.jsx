
import React from "react";
import { Link, useLocation } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Calendar, Plus, LogOut, Settings } from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { User as UserEntity } from "@/entities/User";

const navigationItems = [
  {
    title: "캘린더",
    url: createPageUrl("Dashboard"),
    icon: Calendar,
    description: "미팅 일정 보기"
  },
  {
    title: "미팅 생성",
    url: createPageUrl("CreateMeeting"),
    icon: Plus,
    description: "새 미팅 만들기"
  }
];

export default function Layout({ children, currentPageName }) {
  const location = useLocation();
  const [user, setUser] = React.useState(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    // 앱 브랜딩 설정
    document.title = "promiseU";
    const favicon = document.querySelector("link[rel~='icon']");
    if (favicon) {
      const emoji = '📆';
      const canvas = document.createElement('canvas');
      canvas.width = 32;
      canvas.height = 32;
      const ctx = canvas.getContext('2d');
      ctx.font = '28px serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(emoji, 16, 16);
      favicon.href = canvas.toDataURL('image/png');
    }
    
    loadUser();
  }, [location.pathname]); // 페이지 이동 시마다 사용자 정보 다시 확인

  const loadUser = async () => {
    try {
      const currentUser = await UserEntity.me();
      setUser(currentUser);
    } catch (error) {
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    await UserEntity.logout();
    window.location.reload();
  };
  
  // 로그인 페이지에서는 레이아웃을 표시하지 않음
  if (currentPageName === 'Login') {
      return <>{children}</>;
  }

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-slate-50">
        <Sidebar className="border-r border-slate-200/60 bg-white">
          <SidebarHeader className="border-b border-slate-100 p-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-slate-900 to-slate-700 rounded-xl flex items-center justify-center shadow-sm text-2xl">
                📆
              </div>
              <div>
                <h2 className="font-bold text-slate-900 text-lg">promiseU</h2>
                <p className="text-xs text-slate-500">실시간 약속 관리</p>
              </div>
            </div>
          </SidebarHeader>
          
          <SidebarContent className="p-4">
            <SidebarGroup>
              <SidebarGroupLabel className="text-xs font-semibold text-slate-500 uppercase tracking-wider px-3 py-2">
                메인 메뉴
              </SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu className="space-y-1">
                  {navigationItems.map((item) => (
                    <SidebarMenuItem key={item.title}>
                      <SidebarMenuButton 
                        asChild 
                        className={`hover:bg-slate-50 transition-all duration-200 rounded-xl p-3 group ${
                          location.pathname.startsWith(item.url) ? 'bg-slate-900 text-white hover:bg-slate-800' : 'text-slate-700'
                        }`}
                      >
                        <Link to={item.url} className="flex items-center gap-3">
                          <item.icon className={`w-5 h-5 ${
                            location.pathname.startsWith(item.url) ? 'text-white' : 'text-slate-500 group-hover:text-slate-700'
                          }`} />
                          <div>
                            <div className="font-medium text-sm">{item.title}</div>
                            <div className={`text-xs ${
                              location.pathname.startsWith(item.url) ? 'text-slate-300' : 'text-slate-500'
                            }`}>
                              {item.description}
                            </div>
                          </div>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </SidebarContent>

          <SidebarFooter className="border-t border-slate-100 p-4">
            {!loading && user && (
                <div className="space-y-2">
                  <div className="flex items-center gap-3 px-3 py-2">
                    <Avatar className="h-10 w-10">
                      <AvatarImage src={user.avatar_url} alt={user.full_name} />
                      <AvatarFallback className="bg-slate-900 text-white font-medium">
                        {user.nickname?.charAt(0) || user.full_name?.charAt(0) || user.email?.charAt(0)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-slate-900 text-sm truncate">
                        {user.nickname || user.full_name || "사용자"}
                      </p>
                      <p className="text-xs text-slate-500 truncate">{user.email}</p>
                    </div>
                  </div>
                  <div className="flex flex-col gap-1">
                    <Button
                      variant="ghost"
                      asChild
                      className="w-full justify-start text-slate-600 hover:text-slate-900 hover:bg-slate-50"
                    >
                      <Link to={createPageUrl("Profile")}>
                        <Settings className="w-4 h-4 mr-2" />
                        프로필 설정
                      </Link>
                    </Button>
                    <Button
                      variant="ghost"
                      onClick={handleLogout}
                      className="w-full justify-start text-slate-600 hover:text-slate-900 hover:bg-slate-50"
                    >
                      <LogOut className="w-4 h-4 mr-2" />
                      로그아웃
                    </Button>
                  </div>
                </div>
            )}
          </SidebarFooter>
        </Sidebar>

        <main className="flex-1 flex flex-col overflow-hidden">
          <header className="bg-white border-b border-slate-200 px-4 py-3 md:hidden">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-xl">📆</span>
                <h1 className="font-bold text-slate-900">promiseU</h1>
              </div>
              <SidebarTrigger className="hover:bg-slate-100 p-2 rounded-lg transition-colors duration-200" />
            </div>
          </header>

          <div className="flex-1 overflow-auto bg-slate-50 flex flex-col">
            <div className="flex-grow">
              {children}
            </div>
            <footer className="text-center p-4 text-xs text-slate-500 bg-slate-50">
              Wooooo~ JINI
            </footer>
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
}
