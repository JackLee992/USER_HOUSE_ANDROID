package io.github.jacklee992.wanba;

import android.app.AlertDialog;

import android.content.Context;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.Path;
import android.graphics.RectF;
import android.graphics.drawable.Drawable;
import android.graphics.drawable.GradientDrawable;
import android.graphics.drawable.RippleDrawable;
import android.content.res.ColorStateList;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.MotionEvent;
import android.view.ViewConfiguration;
import android.view.accessibility.AccessibilityNodeInfo;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.ImageButton;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.ScrollView;
import android.widget.Switch;
import android.widget.TextView;

import androidx.recyclerview.widget.GridLayoutManager;
import androidx.recyclerview.widget.ItemTouchHelper;
import androidx.recyclerview.widget.RecyclerView;
import androidx.swiperefreshlayout.widget.SwipeRefreshLayout;
import org.json.JSONArray;
import org.json.JSONObject;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

/** One recyclable native catalog and settings surface shared by WebView and GeckoView. */
final class NativeCatalogView extends FrameLayout {
    interface Actions {
        void refresh(); void tab(String tab); void launch(String id, String tab); void preferences(JSONObject preferences);
        void preference(String operation, Object value); void exportBackup(); void importBackup();
        void checkUpdate(); void installUpdate(); void rollback(); void downloads(); void appUpdater(); void licenses();
    }
    private static final int BG = Color.rgb(245,246,250), INK = Color.rgb(32,38,54), MUTED = Color.rgb(100,112,135), ACCENT = Color.rgb(75,94,203);
    private final Actions actions;
    private final NativeIconLoader icons;
    private final LinearLayout column, segments;
    private final GlassNavigation navigation;
    private final FrameLayout content;
    private final TextView title;
    private final Button sort;
    private final RecyclerView grid;
    private final SwipeRefreshLayout refresh;
    private final GridLayoutManager gridLayout;
    private final GamesAdapter adapter = new GamesAdapter();
    private final ItemTouchHelper drag;
    private final TextView loading;
    private JSONObject catalog = new JSONObject(), labels = new JSONObject(), update = new JSONObject();
    private String tab = "single", gameMode = "single";
    private final List<JSONObject> all = new ArrayList<>();
    private final Set<String> favorites = new HashSet<>();
    private final List<String> order = new ArrayList<>();
    private boolean pending, sorting, moved, cardDragging;
    private TextView updateText;
    private Button checkButton, installButton, rollbackButton;

    NativeCatalogView(Context context, NativeIconLoader icons, Actions actions) {
        super(context); this.icons = icons; this.actions = actions;
        setBackgroundColor(BG); setClickable(true); setFocusable(true); setImportantForAccessibility(IMPORTANT_FOR_ACCESSIBILITY_YES);
        column = new LinearLayout(context); column.setOrientation(LinearLayout.VERTICAL); addView(column, new LayoutParams(-1,-1));
        LinearLayout header = new LinearLayout(context); header.setGravity(Gravity.CENTER_VERTICAL); header.setPadding(dp(20),dp(12),dp(16),dp(8));
        title = text("玩吧",34,INK); title.setTypeface(android.graphics.Typeface.create("sans-serif", android.graphics.Typeface.BOLD)); title.setIncludeFontPadding(false);
        header.addView(title,new LinearLayout.LayoutParams(0,-2,1));
        sort = button("⋯"); sort.setTextSize(25); sort.setMinWidth(dp(48)); sort.setOnClickListener(v->{sorting=!sorting;render();}); header.addView(sort,new LinearLayout.LayoutParams(dp(48),dp(48)));
        column.addView(header,new LinearLayout.LayoutParams(-1,dp(76)));
        segments = new LinearLayout(context); segments.setGravity(Gravity.CENTER); segments.setPadding(dp(3),dp(6),dp(3),dp(6));
        LinearLayout.LayoutParams sp = new LinearLayout.LayoutParams(-1,dp(48)); sp.setMargins(dp(20),0,dp(20),dp(6)); column.addView(segments,sp);
        content = new FrameLayout(context); column.addView(content,new LinearLayout.LayoutParams(-1,0,1));
        grid = new RecyclerView(context); grid.setId(View.generateViewId());
        grid.setClipToPadding(false); grid.setPadding(dp(14),0,dp(14),dp(96)); grid.setHasFixedSize(true);
        gridLayout = new GridLayoutManager(context,2); grid.setLayoutManager(gridLayout); grid.setAdapter(adapter);
        grid.addItemDecoration(new RecyclerView.ItemDecoration(){@Override public void getItemOffsets(android.graphics.Rect out,View view,RecyclerView parent,RecyclerView.State state){out.set(dp(6),dp(6),dp(6),dp(6));}});
        refresh=new SwipeRefreshLayout(context);refresh.setColorSchemeColors(ACCENT);refresh.setProgressBackgroundColorSchemeColor(Color.WHITE);refresh.addView(grid);refresh.setOnRefreshListener(()->actions.refresh());
        drag = new ItemTouchHelper(new ItemTouchHelper.SimpleCallback(ItemTouchHelper.UP|ItemTouchHelper.DOWN|ItemTouchHelper.LEFT|ItemTouchHelper.RIGHT,0){
            @Override public void onSelectedChanged(RecyclerView.ViewHolder holder,int state){cardDragging=state==ItemTouchHelper.ACTION_STATE_DRAG;super.onSelectedChanged(holder,state);}
            @Override public boolean isLongPressDragEnabled(){return !pending&&!"settings".equals(tab)&&adapter.items.size()>1;}
            @Override public boolean onMove(RecyclerView view,RecyclerView.ViewHolder from,RecyclerView.ViewHolder to){
                int a=from.getBindingAdapterPosition(),b=to.getBindingAdapterPosition();if(a<0||b<0||pending)return false;
                JSONObject moving=adapter.items.remove(a);adapter.items.add(b,moving);adapter.notifyItemMoved(a,b);moved=true;return true;
            }
            @Override public void onSwiped(RecyclerView.ViewHolder holder,int direction){}
            @Override public void clearView(RecyclerView recycler,RecyclerView.ViewHolder holder){super.clearView(recycler,holder);if(moved){moved=false;commitVisibleOrder();}}
        }); drag.attachToRecyclerView(grid);
        navigation = new GlassNavigation(context);
        LayoutParams nav = new LayoutParams(dp(300),dp(64),Gravity.BOTTOM|Gravity.CENTER_HORIZONTAL); nav.setMargins(0,0,0,dp(10)); addView(navigation,nav);
        loading = text("玩吧",24,INK);loading.setTypeface(null,1);loading.setGravity(Gravity.CENTER);loading.setBackgroundColor(BG);
        addView(loading,new LayoutParams(-1,-1));
    }
    int dp(float value){return Math.round(value*getResources().getDisplayMetrics().density);}
    String label(String source){
        if(labels.has(source))return labels.optString(source,source);
        String key=null,value=null;
        if(source.startsWith("正在下载 ")){key="downloadingPackage";value=source.substring(5);}
        else if(source.startsWith("资源版本 ")){key="resourceVersion";value=source.substring(5);}
        else {java.util.regex.Matcher match=java.util.regex.Pattern.compile("^GitHub 下载失败（(\\d+)），已保留离线内容$").matcher(source);if(match.matches()){key="githubDownloadFailure";value=match.group(1);}}
        return key!=null&&labels.has(key)?labels.optString(key).replace("{value}",value):source;
    }
    void stopRefresh(){refresh.setRefreshing(false);}
    String template(String key,String value){return labels.optString(key,"appUpdateVersion".equals(key)?"App {value}":"游戏内容 {value}").replace("{value}",value);}
    boolean idle(){return !sorting&&!moved&&!cardDragging&&grid.getScrollState()==RecyclerView.SCROLL_STATE_IDLE&&navigation.pointer<0;}
    boolean isSettings(){return "settings".equals(tab);}
    void showLoading(){setVisibility(VISIBLE);loading.setVisibility(VISIBLE);navigation.setImportantForAccessibility(IMPORTANT_FOR_ACCESSIBILITY_NO_HIDE_DESCENDANTS);column.setImportantForAccessibility(IMPORTANT_FOR_ACCESSIBILITY_NO_HIDE_DESCENDANTS);}
    void setPending(boolean value){pending=value;refresh.setEnabled(!value);grid.setEnabled(!value);sort.setEnabled(!value);navigation.setPending(value);for(int i=0;i<segments.getChildCount();i++)segments.getChildAt(i).setEnabled(!value);adapter.notifyItemRangeChanged(0,adapter.getItemCount(),"pending");}
    void setCatalog(JSONObject value){
        refresh.setRefreshing(false);catalog=value;labels=value.optJSONObject("labels")==null?new JSONObject():value.optJSONObject("labels");tab=value.optString("tab","single");if("single".equals(tab)||"double".equals(tab))gameMode=tab;
        all.clear();JSONArray games=value.optJSONArray("games");if(games!=null)for(int i=0;i<Math.min(games.length(),128);i++){JSONObject game=games.optJSONObject(i);if(game!=null&&game.optString("id").matches("[a-z0-9_-]{1,64}"))all.add(game);}
        favorites.clear();order.clear();JSONObject prefs=value.optJSONObject("preferences");
        JSONArray fav=prefs==null?null:prefs.optJSONArray("favorites"),ids=prefs==null?null:prefs.optJSONArray("order");
        if(fav!=null)for(int i=0;i<fav.length();i++)favorites.add(fav.optString(i));
        if(ids!=null)for(int i=0;i<ids.length();i++)if(!order.contains(ids.optString(i)))order.add(ids.optString(i));
        for(JSONObject game:all)if(!order.contains(game.optString("id")))order.add(game.optString("id"));
        all.sort((a,b)->Integer.compare(order.indexOf(a.optString("id")),order.indexOf(b.optString("id"))));
        loading.setVisibility(GONE);navigation.setImportantForAccessibility(IMPORTANT_FOR_ACCESSIBILITY_AUTO);column.setImportantForAccessibility(IMPORTANT_FOR_ACCESSIBILITY_AUTO);render();
    }
    @Override protected void onMeasure(int widthSpec,int heightSpec){LayoutParams nav=(LayoutParams)navigation.getLayoutParams();nav.width=Math.min(dp(340),Math.max(dp(276),MeasureSpec.getSize(widthSpec)-dp(120)));super.onMeasure(widthSpec,heightSpec);}
    @Override protected void onSizeChanged(int width,int height,int oldWidth,int oldHeight){super.onSizeChanged(width,height,oldWidth,oldHeight);int count=width/getResources().getDisplayMetrics().density>=700?4:2;if(gridLayout.getSpanCount()!=count)gridLayout.setSpanCount(count);}
    private void render(){
        String heading="settings".equals(tab)?"设置":"my".equals(tab)?"我的收藏":"玩吧";
        grid.setContentDescription(label(heading));
        title.setText(label(heading)); sort.setVisibility(isSettings()?GONE:VISIBLE); sort.setText(sorting?label("完成"):"⋯"); sort.setTextSize(sorting?14:25); sort.setContentDescription(label(sorting?"完成排序":"自定义排序"));
        navigation.bind();
        boolean games="single".equals(tab)||"double".equals(tab); segments.setVisibility(games?VISIBLE:GONE); segments.removeAllViews();
        if(games){
            // The 36 dp visual segment sits inside a 48 dp touch target.
            GradientDrawable track=shape(0xffe9eaf0,9); android.graphics.drawable.InsetDrawable inset=new android.graphics.drawable.InsetDrawable(track,0,dp(6),0,dp(6)); segments.setBackground(inset);
            String[] modes={"single","double"},names={"单人游戏","人机挑战"};
            for(int i=0;i<2;i++){String mode=modes[i];Button choice=button(label(names[i]));choice.setTextSize(13);choice.setTextColor(INK);choice.setTypeface(null,mode.equals(tab)?1:0);choice.setPadding(dp(6),0,dp(6),0);choice.setMinHeight(0);choice.setMinimumHeight(0);choice.setBackground(ripple(mode.equals(tab)?Color.WHITE:Color.TRANSPARENT,7));choice.setSelected(mode.equals(tab));choice.setEnabled(!pending);choice.setOnClickListener(v->{if(!pending&&!mode.equals(tab)){sorting=false;actions.tab(mode);}});segments.addView(choice,new LinearLayout.LayoutParams(0,-1,1));}
        }
        content.removeAllViews();
        if(isSettings()){content.addView(settings(),new LayoutParams(-1,-1));return;}
        List<JSONObject> shown=new ArrayList<>();for(JSONObject game:all){String id=game.optString("id");if("my".equals(tab)?favorites.contains(id):tab.equals(game.optString("mode")))shown.add(game);}
        adapter.replace(shown);
        if(shown.isEmpty()){
            LinearLayout empty=new LinearLayout(getContext());empty.setOrientation(LinearLayout.VERTICAL);empty.setGravity(Gravity.CENTER);empty.setPadding(dp(28),dp(24),dp(28),dp(24));
            TextView title=text(label("my".equals(tab)?"还没有收藏的游戏":"暂无游戏"),20,INK);title.setGravity(Gravity.CENTER);empty.addView(title);
            TextView detail=text(label("在游戏列表点收藏，即可在这里找到。"),15,MUTED);detail.setGravity(Gravity.CENTER);detail.setPadding(0,dp(16),0,dp(20));empty.addView(detail);
            Button go=button(label("去看看游戏"));go.setOnClickListener(v->actions.tab("single"));empty.addView(go);content.addView(empty,new LayoutParams(-1,-1));
        }else content.addView(refresh,new LayoutParams(-1,-1));
    }
    private JSONObject preferences(){JSONObject prefs=new JSONObject();try{prefs.put("favorites",new JSONArray(favorites));prefs.put("order",new JSONArray(order));}catch(Exception ignored){}return prefs;}
    private void commitVisibleOrder(){
        Set<String> visible=new HashSet<>();List<String> movedIds=new ArrayList<>();for(JSONObject game:adapter.items){visible.add(game.optString("id"));movedIds.add(game.optString("id"));}
        int cursor=0;for(int i=0;i<order.size();i++)if(visible.contains(order.get(i)))order.set(i,movedIds.get(cursor++));actions.preferences(preferences());
    }
    private void shift(int index,int delta){if(pending)return;int to=index+delta;if(index<0||to<0||to>=adapter.items.size())return;Collections.swap(adapter.items,index,to);adapter.notifyItemMoved(index,to);commitVisibleOrder();}
    private View settings(){
        ScrollView scroll=new ScrollView(getContext());scroll.setFillViewport(true);LinearLayout body=new LinearLayout(getContext());body.setOrientation(LinearLayout.VERTICAL);body.setPadding(dp(20),0,dp(20),dp(96));scroll.addView(body);
        LinearLayout preferences=section(body,"偏好设置");
        JSONArray locales=catalog.optJSONArray("locales");String language=catalog.optString("locale");if(locales!=null)for(int i=0;i<locales.length();i++){JSONObject locale=locales.optJSONObject(i);if(locale!=null&&language.equals(locale.optString("id")))language=locale.optString("name");}
        setting(preferences,label("界面语言"),language,()->chooseLanguage());
        String mode=catalog.optString("performance","normal"),modeLabel="eco".equals(mode)?"省电":"game".equals(mode)?"游戏":"普通";
        setting(preferences,label("性能与画质"),label(modeLabel),()->choosePerformance());
        Switch remember=new Switch(getContext());remember.setText(label("下次打开时回到上次游戏"));remember.setTextSize(16);remember.setEnabled(!pending);remember.setTextColor(INK);remember.setMinHeight(dp(56));remember.setPadding(dp(16),dp(8),dp(16),dp(8));remember.setChecked(catalog.optBoolean("rememberWindow"));remember.setOnCheckedChangeListener((button,checked)->{if(!pending)actions.preference("setRememberWindow",checked);});preferences.addView(remember,new LinearLayout.LayoutParams(-1,-2));
        note(body,"游戏进度会自动保存到本机。返回游戏时可选择继续；此开关只控制打开应用后的页面。");
        LinearLayout backup=section(body,"游戏备份");
        action(backup,"导出备份",actions::exportBackup);action(backup,"导入备份",actions::importBackup);note(body,"数据保存在当前设备，卸载应用会删除本机存档。");
        if(BuildConfig.WANBA_GAME_UPDATES){
            LinearLayout updates=section(body,"游戏内容");updateText=text("",13,MUTED);updateText.setPadding(dp(16),dp(12),dp(16),dp(12));updates.addView(updateText);
            checkButton=action(updates,"检查更新",actions::checkUpdate);installButton=action(updates,"下载游戏更新",actions::installUpdate);rollbackButton=action(updates,"回退内容版本",actions::rollback);renderUpdate();
        }
        LinearLayout about=section(body,"关于玩吧");JSONObject info=catalog.optJSONObject("appInfo");
        if(info!=null){TextView version=text("v"+info.optString("appVersion",BuildConfig.VERSION_NAME)+" · "+info.optString("engine","")+" "+info.optString("engineVersion",""),13,MUTED);version.setPadding(dp(16),dp(14),dp(16),dp(14));about.addView(version);}
        if(BuildConfig.WANBA_APP_UPDATER)action(about,"检查更新",actions::appUpdater);action(about,"开源致谢",actions::licenses);if(BuildConfig.WANBA_GAME_UPDATES||BuildConfig.WANBA_APP_UPDATER)action(about,"下载更新",actions::downloads);
        return scroll;
    }
    void setUpdate(JSONObject value){update=value;renderUpdate();}
    private void renderUpdate(){if(updateText==null)return;JSONObject active=update.optJSONObject("active"),candidate=update.optJSONObject("candidate"),job=update.optJSONObject("job");String state=job==null?"":job.optString("state");
        String version=active==null?"":active.optString("snapshotVersion");String message=job==null?"":label(job.optString("message"));
        String details="";
        if(candidate!=null){JSONArray candidates=candidate.optJSONArray("packages"),installed=active==null?null:active.optJSONArray("packages");Set<String> hashes=new HashSet<>();if(installed!=null)for(int i=0;i<installed.length();i++){JSONObject pack=installed.optJSONObject(i);if(pack!=null)hashes.add(pack.optString("sha256"));}int count=0;long bytes=0;if(candidates!=null)for(int i=0;i<candidates.length();i++){JSONObject pack=candidates.optJSONObject(i);if(pack!=null&&!hashes.contains(pack.optString("sha256"))){count++;bytes+=pack.optLong("size");}}
            details="\nv"+candidate.optString("snapshotVersion")+" · "+count+" · "+String.format(java.util.Locale.getDefault(),"%.1f MB",bytes/1048576d);
        }
        if("downloading".equals(state)&&job!=null)details+="\n"+String.format(java.util.Locale.getDefault(),"%.1f / %.1f MB",job.optLong("downloadedBytes")/1048576d,job.optLong("totalBytes")/1048576d);
        updateText.setText((version.isEmpty()?"":label("资源版本 "+version)+"\n")+message+details);
        boolean busy=pending||java.util.Arrays.asList("checking","downloading","activating").contains(state);checkButton.setEnabled(!busy);
        installButton.setVisibility(candidate==null?GONE:VISIBLE);installButton.setText(label(update.optBoolean("candidateReady")?"安装并刷新":"下载游戏更新"));installButton.setEnabled(!busy);
        rollbackButton.setVisibility(update.isNull("previousSnapshotId")||update.optString("previousSnapshotId").isEmpty()?GONE:VISIBLE);rollbackButton.setEnabled(!busy);
    }
    private void chooseLanguage(){JSONArray locales=catalog.optJSONArray("locales");if(locales==null)return;String[] names=new String[locales.length()];int selected=0;for(int i=0;i<names.length;i++){JSONObject locale=locales.optJSONObject(i);names[i]=locale==null?"":locale.optString("name");if(locale!=null&&locale.optString("id").equals(catalog.optString("locale")))selected=i;}
        new AlertDialog.Builder(getContext()).setTitle(label("界面语言")).setSingleChoiceItems(names,selected,(dialog,which)->{dialog.dismiss();actions.preference("setLocale",locales.optJSONObject(which).optString("id"));}).setNegativeButton(label("取消"),null).show();}
    private void choosePerformance(){String[] modes={"eco","normal","game"},names={label("省电"),label("普通"),label("游戏")};int selected=1;for(int i=0;i<3;i++)if(modes[i].equals(catalog.optString("performance")))selected=i;
        new AlertDialog.Builder(getContext()).setTitle(label("性能与画质")).setSingleChoiceItems(names,selected,(dialog,which)->{dialog.dismiss();actions.preference("setPerformance",modes[which]);}).setNegativeButton(label("取消"),null).show();}
    private LinearLayout section(LinearLayout parent,String name){
        TextView heading=text(label(name),13,MUTED);heading.setPadding(dp(16),dp(22),dp(16),dp(8));parent.addView(heading);
        LinearLayout section=new LinearLayout(getContext());section.setOrientation(LinearLayout.VERTICAL);section.setBackground(shape(Color.WHITE,12));section.setClipToOutline(true);parent.addView(section,new LinearLayout.LayoutParams(-1,-2));return section;
    }
    private void note(LinearLayout parent,String source){TextView note=text(label(source),12,MUTED);note.setLineSpacing(dp(2),1);note.setPadding(dp(16),dp(8),dp(16),0);parent.addView(note);}
    private void divider(LinearLayout parent){if(parent.getChildCount()==0)return;View line=new View(getContext());line.setBackgroundColor(0xffeceef3);LinearLayout.LayoutParams lp=new LinearLayout.LayoutParams(-1,dp(0.5f));lp.leftMargin=dp(16);parent.addView(line,lp);}
    private void setting(LinearLayout parent,String name,String value,Runnable action){
        divider(parent);LinearLayout row=new LinearLayout(getContext());row.setGravity(Gravity.CENTER_VERTICAL);row.setPadding(dp(16),dp(11),dp(16),dp(11));row.setMinimumHeight(dp(66));row.setBackground(ripple(Color.TRANSPARENT,0));row.setClickable(true);row.setFocusable(true);row.setContentDescription(name+" · "+value);row.setEnabled(!pending);
        LinearLayout words=new LinearLayout(getContext());words.setOrientation(LinearLayout.VERTICAL);TextView label=text(name,16,INK);label.setMaxLines(2);words.addView(label);TextView detail=text(value,13,MUTED);detail.setPadding(0,dp(3),0,0);words.addView(detail);row.addView(words,new LinearLayout.LayoutParams(0,-2,1));TextView arrow=text("›",22,MUTED);arrow.setPadding(dp(12),0,0,0);row.addView(arrow,new LinearLayout.LayoutParams(-2,-2));row.setOnClickListener(v->{if(!pending)action.run();});parent.addView(row,new LinearLayout.LayoutParams(-1,-2));
    }
    private Button action(LinearLayout parent,String label,Runnable action){divider(parent);Button button=button(label(label));button.setTextSize(16);button.setPadding(dp(16),0,dp(16),0);button.setGravity(Gravity.START|Gravity.CENTER_VERTICAL);button.setEnabled(!pending);button.setOnClickListener(v->{if(!pending)action.run();});parent.addView(button,new LinearLayout.LayoutParams(-1,dp(52)));return button;}
    private TextView text(String value,float size,int color){TextView view=new TextView(getContext());view.setText(value);view.setTextSize(size);view.setTextColor(color);return view;}
    private Button button(String value){Button view=new Button(getContext());view.setText(value);view.setTextSize(14);view.setAllCaps(false);view.setTextColor(ACCENT);view.setMinHeight(dp(48));view.setPadding(dp(10),0,dp(10),0);view.setBackground(ripple(0x00ffffff,12));return view;}
    private GradientDrawable shape(int color,int radius){GradientDrawable drawable=new GradientDrawable();drawable.setColor(color);drawable.setCornerRadius(dp(radius));return drawable;}
    private Drawable ripple(int color,int radius){return new RippleDrawable(ColorStateList.valueOf(0x204b5ecb),shape(color,radius),shape(Color.WHITE,radius));}

    /** Translucent native controls over the live list, with no bitmap capture or JS on move. */
    private final class GlassNavigation extends FrameLayout {
        private final View pill;
        private final FrameLayout[] items=new FrameLayout[3];
        private final ImageView[] marks=new ImageView[3];
        private final TextView[] names=new TextView[3];
        private final int slop=ViewConfiguration.get(getContext()).getScaledTouchSlop();
        private int selected,preview,pointer=-1;
        private float startX,startY;
        private boolean dragging,cancelled;
        GlassNavigation(Context context){
            super(context);setClipChildren(false);setClipToPadding(false);
            GradientDrawable glass=shape(0xefffffff,32);glass.setStroke(dp(1),0xf0ffffff);setBackground(glass);setElevation(dp(8));
            pill=new View(context);GradientDrawable active=shape(0x194b5ecb,28);active.setStroke(dp(1),0x60ffffff);pill.setBackground(active);pill.setImportantForAccessibility(IMPORTANT_FOR_ACCESSIBILITY_NO);addView(pill,new LayoutParams(0,dp(54)));
            for(int i=0;i<3;i++){
                final int index=i;FrameLayout item=new FrameLayout(context);items[i]=item;item.setClickable(true);item.setFocusable(true);item.setImportantForAccessibility(IMPORTANT_FOR_ACCESSIBILITY_YES);
                item.setAccessibilityDelegate(new View.AccessibilityDelegate(){@Override public void onInitializeAccessibilityNodeInfo(View host,AccessibilityNodeInfo info){super.onInitializeAccessibilityNodeInfo(host,info);info.setClassName("android.widget.Button");info.setSelected(index==selected);}});
                marks[i]=new ImageView(context);marks[i].setImportantForAccessibility(IMPORTANT_FOR_ACCESSIBILITY_NO);LayoutParams ip=new LayoutParams(dp(24),dp(24),Gravity.TOP|Gravity.CENTER_HORIZONTAL);ip.topMargin=dp(10);item.addView(marks[i],ip);
                names[i]=text("",11,MUTED);names[i].setTypeface(android.graphics.Typeface.create("sans-serif-medium",0));names[i].setGravity(Gravity.CENTER);names[i].setIncludeFontPadding(false);names[i].setMaxLines(1);names[i].setImportantForAccessibility(IMPORTANT_FOR_ACCESSIBILITY_NO);LayoutParams np=new LayoutParams(-1,dp(16),Gravity.TOP);np.topMargin=dp(39);item.addView(names[i],np);
                item.setOnClickListener(v->{if(!pending)commit(index);});
                item.setOnTouchListener((v,event)->gesture(item,event));addView(item,new LayoutParams(0,-1));
            }
        }
        void setPending(boolean value){for(View item:items)item.setEnabled(!value);if(value)resetPreview(false);}
        void bind(){selected="settings".equals(tab)?2:"my".equals(tab)?1:0;String[] titles={"玩吧","我的","设置"};for(int i=0;i<3;i++){names[i].setText(label(titles[i]));items[i].setContentDescription(label(titles[i]));items[i].setSelected(i==selected);items[i].setEnabled(!pending);}resetPreview(false);}
        @Override protected void onMeasure(int widthSpec,int heightSpec){int w=MeasureSpec.getSize(widthSpec),h=MeasureSpec.getSize(heightSpec),cell=w/3;setMeasuredDimension(w,h);for(int i=0;i<3;i++)items[i].measure(MeasureSpec.makeMeasureSpec(i==2?w-cell*2:cell,MeasureSpec.EXACTLY),MeasureSpec.makeMeasureSpec(h,MeasureSpec.EXACTLY));pill.measure(MeasureSpec.makeMeasureSpec(cell-dp(8),MeasureSpec.EXACTLY),MeasureSpec.makeMeasureSpec(dp(54),MeasureSpec.EXACTLY));}
        @Override protected void onLayout(boolean changed,int left,int top,int right,int bottom){int w=right-left,cell=w/3;for(int i=0;i<3;i++)items[i].layout(cell*i,0,i==2?w:cell*(i+1),bottom-top);pill.layout(0,dp(5),cell-dp(8),dp(59));if(changed)resetPreview(false);}
        private void colors(int index){preview=index;for(int i=0;i<3;i++){int color=i==index?ACCENT:INK;marks[i].setImageDrawable(new Mark(i==0?0:i==1?4:3,color));names[i].setTextColor(color);}}
        private float position(int index){return getWidth()/3f*index+dp(4);}
        private void resetPreview(boolean animate){pointer=-1;dragging=false;cancelled=false;colors(selected);pill.animate().cancel();if(animate)pill.animate().translationX(position(selected)).scaleX(1).scaleY(1).setDuration(130).start();else{pill.setTranslationX(position(selected));pill.setScaleX(1);pill.setScaleY(1);}}
        private void commit(int index){colors(index);pill.animate().cancel();pill.animate().translationX(position(index)).scaleX(1).scaleY(1).setDuration(130).start();if(index==selected)return;sorting=false;actions.tab(index==2?"settings":index==1?"my":gameMode);}
        private boolean gesture(FrameLayout item,MotionEvent event){
            if(pending)return false;float x=event.getX()+item.getLeft(),y=event.getY();
            switch(event.getActionMasked()){
                case MotionEvent.ACTION_DOWN:pointer=event.getPointerId(0);startX=x;startY=y;dragging=false;cancelled=false;pill.animate().cancel();getParent().requestDisallowInterceptTouchEvent(true);return true;
                case MotionEvent.ACTION_POINTER_DOWN:cancelled=true;resetVisual();return true;
                case MotionEvent.ACTION_MOVE:
                    if(event.getPointerId(0)!=pointer||cancelled)return true;
                    if(x<0||x>getWidth()||y < -dp(12)||y>getHeight()+dp(12)){cancelled=true;resetVisual();return true;}
                    if(!dragging&&Math.abs(y-startY)>slop&&Math.abs(y-startY)>Math.abs(x-startX)){cancelled=true;resetVisual();return true;}
                    if(Math.abs(x-startX)>slop)dragging=true;
                    if(dragging){int target=Math.max(0,Math.min(2,(int)(x/(getWidth()/3f))));if(target!=preview)colors(target);float left=Math.max(dp(4),Math.min(getWidth()-pill.getWidth()-dp(4),x-pill.getWidth()/2f));pill.setTranslationX(left);pill.setScaleX(1.03f);pill.setScaleY(1.04f);}return true;
                case MotionEvent.ACTION_UP:
                    getParent().requestDisallowInterceptTouchEvent(false);boolean valid=!cancelled&&pointer==event.getPointerId(0)&&x>=0&&x<=getWidth()&&y>=-dp(12)&&y<=getHeight()+dp(12);int target=preview;boolean wasDragging=dragging;pointer=-1;dragging=false;cancelled=false;
                    if(!valid)resetPreview(true);else if(wasDragging)commit(target);else item.performClick();return true;
                case MotionEvent.ACTION_CANCEL:getParent().requestDisallowInterceptTouchEvent(false);resetPreview(true);return true;
                default:return true;
            }
        }
        private void resetVisual(){colors(selected);pill.animate().cancel();pill.animate().translationX(position(selected)).scaleX(1).scaleY(1).setDuration(130).start();}
        @Override protected void onDetachedFromWindow(){pill.animate().cancel();super.onDetachedFromWindow();}
    }

    private final class GamesAdapter extends RecyclerView.Adapter<GameHolder>{
        final List<JSONObject> items=new ArrayList<>();GamesAdapter(){setHasStableIds(true);}
        @Override public long getItemId(int position){return items.get(position).optString("id").hashCode();}
        @Override public int getItemCount(){return items.size();}
        void replace(List<JSONObject> next){items.clear();items.addAll(next);notifyDataSetChanged();}
        @Override public GameHolder onCreateViewHolder(ViewGroup parent,int type){return new GameHolder();}
        @Override public void onBindViewHolder(GameHolder holder,int position){holder.bind(items.get(position));}
    }
    private final class GameHolder extends RecyclerView.ViewHolder {
        final FrameLayout card;final ImageView image;final ImageButton favorite;final TextView name,score;final LinearLayout arrows;final Button up,down;
        GameHolder(){super(new FrameLayout(getContext()));card=(FrameLayout)itemView;int height=getResources().getConfiguration().fontScale>1.3f?244:194;card.setLayoutParams(new RecyclerView.LayoutParams(-1,dp(height)));card.setBackground(ripple(Color.WHITE,18));card.setFocusable(true);card.setClickable(true);
            image=new ImageView(getContext());image.setScaleType(ImageView.ScaleType.CENTER_CROP);image.setBackground(shape(Color.TRANSPARENT,15));image.setClipToOutline(true);image.setImportantForAccessibility(IMPORTANT_FOR_ACCESSIBILITY_NO);LayoutParams ip=new LayoutParams(dp(68),dp(68),Gravity.TOP|Gravity.START);ip.setMargins(dp(14),dp(14),0,0);card.addView(image,ip);
            favorite=new ImageButton(getContext());favorite.setBackground(ripple(Color.TRANSPARENT,24));favorite.setPadding(dp(12),dp(12),dp(12),dp(12));LayoutParams fp=new LayoutParams(dp(48),dp(48),Gravity.TOP|Gravity.END);fp.topMargin=dp(4);fp.rightMargin=dp(2);card.addView(favorite,fp);
            LinearLayout text=new LinearLayout(getContext());text.setOrientation(LinearLayout.VERTICAL);LayoutParams tp=new LayoutParams(-1,-2);tp.setMargins(dp(14),dp(94),dp(12),0);card.addView(text,tp);name=NativeCatalogView.this.text("",17,INK);name.setTypeface(android.graphics.Typeface.create("sans-serif-medium",0));name.setIncludeFontPadding(false);name.setMaxLines(2);text.addView(name);score=NativeCatalogView.this.text("",12,MUTED);score.setMaxLines(2);score.setIncludeFontPadding(false);score.setPadding(0,dp(6),0,0);text.addView(score);
            arrows=new LinearLayout(getContext());arrows.setGravity(Gravity.CENTER);up=button("↑");down=button("↓");up.setOnClickListener(v->shift(getBindingAdapterPosition(),-1));down.setOnClickListener(v->shift(getBindingAdapterPosition(),1));arrows.addView(up,new LinearLayout.LayoutParams(0,dp(48),1));arrows.addView(down,new LinearLayout.LayoutParams(0,dp(48),1));card.addView(arrows,new LayoutParams(-1,dp(48),Gravity.BOTTOM));
        }
        void bind(JSONObject game){String id=game.optString("id");name.setText(game.optString("name"));score.setText(game.optString("score"));boolean saved=favorites.contains(id);favorite.setImageDrawable(new Mark(saved?4:2,ACCENT));favorite.setContentDescription(label(saved?"取消收藏":"收藏游戏")+" · "+game.optString("name"));favorite.setEnabled(!pending);
            favorite.setOnClickListener(v->{if(pending)return;if(!favorites.add(id))favorites.remove(id);actions.preferences(preferences());});card.setOnClickListener(v->{if(!pending&&!sorting)actions.launch(id,tab);});card.setEnabled(!pending);card.setContentDescription(game.optString("name")+" · "+game.optString("score")+" · "+label("长按拖动排序"));
            up.setContentDescription(label("上移"));down.setContentDescription(label("下移"));arrows.setVisibility(sorting?VISIBLE:GONE);score.setVisibility(sorting?GONE:VISIBLE);icons.load(image,game.optJSONObject("icon"),dp(68));
        }
    }
    private static final class Mark extends Drawable {
        final Paint paint=new Paint(Paint.ANTI_ALIAS_FLAG);final int type;Mark(int type,int color){this.type=type;paint.setColor(color);paint.setStrokeWidth(1.8f);paint.setStrokeCap(Paint.Cap.ROUND);paint.setStrokeJoin(Paint.Join.ROUND);}
        @Override public void draw(Canvas canvas){canvas.save();canvas.translate(getBounds().left,getBounds().top);canvas.scale(getBounds().width()/24f,getBounds().height()/24f);paint.setStyle(Paint.Style.STROKE);
            if(type==0){Path p=new Path();p.moveTo(7,6);p.lineTo(17,6);p.cubicTo(21,6,22,12,22,17);p.cubicTo(22,21,18,19,15,16);p.lineTo(9,16);p.cubicTo(6,19,2,21,2,17);p.cubicTo(2,12,3,6,7,6);canvas.drawPath(p,paint);canvas.drawLine(6,10,6,14,paint);canvas.drawLine(4,12,8,12,paint);canvas.drawCircle(16,10.5f,.6f,paint);canvas.drawCircle(19,13,.6f,paint);}
            else if(type==1){canvas.drawCircle(8,8,3,paint);canvas.drawCircle(17,9,2.5f,paint);canvas.drawArc(new RectF(2,12,14,24),180,180,false,paint);canvas.drawArc(new RectF(12,13,22,23),180,160,false,paint);}
            else if(type==3){canvas.drawCircle(12,12,6,paint);canvas.drawCircle(12,12,2,paint);for(int i=0;i<8;i++){double a=i*Math.PI/4;canvas.drawLine(12+(float)Math.cos(a)*7,12+(float)Math.sin(a)*7,12+(float)Math.cos(a)*9,12+(float)Math.sin(a)*9,paint);}}
            else{if(type==4)paint.setStyle(Paint.Style.FILL);Path path=new Path();path.moveTo(12,21);path.cubicTo(8,17,2,12,2,7);path.cubicTo(2,1,10,1,12,6);path.cubicTo(14,1,22,1,22,7);path.cubicTo(22,12,16,17,12,21);canvas.drawPath(path,paint);}canvas.restore();}
        @Override public void setAlpha(int alpha){paint.setAlpha(alpha);}@Override public void setColorFilter(android.graphics.ColorFilter filter){paint.setColorFilter(filter);}@Override public int getOpacity(){return android.graphics.PixelFormat.TRANSLUCENT;}
    }
}
