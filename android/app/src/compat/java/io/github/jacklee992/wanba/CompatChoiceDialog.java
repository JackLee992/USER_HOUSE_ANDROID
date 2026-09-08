package io.github.jacklee992.wanba;

import android.app.Activity;
import android.app.AlertDialog;
import android.view.View;
import android.view.ViewGroup;
import android.widget.ArrayAdapter;
import android.widget.ListView;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import org.mozilla.geckoview.GeckoResult;
import org.mozilla.geckoview.GeckoSession.PromptDelegate;
import org.mozilla.geckoview.GeckoSession.PromptDelegate.ChoicePrompt;

/** System selection UI for HTML select/menu elements; labels remain content-provided. */
final class CompatChoiceDialog {
    private final Activity activity;
    private AlertDialog dialog;
    private ChoicePrompt prompt;
    private GeckoResult<PromptDelegate.PromptResponse> response;
    private final Set<String> selected = new LinkedHashSet<>();
    private static final class Row {
        final ChoicePrompt.Choice choice;
        final String label;
        final boolean enabled;
        Row(ChoicePrompt.Choice choice, String label, boolean enabled) { this.choice=choice; this.label=label; this.enabled=enabled; }
        @Override public String toString() { return label; }
    }
    CompatChoiceDialog(Activity activity) { this.activity=activity; }

    GeckoResult<PromptDelegate.PromptResponse> show(ChoicePrompt next) {
        dismiss();
        prompt=next; response=new GeckoResult<>();
        GeckoResult<PromptDelegate.PromptResponse> result=response;
        render();
        return result;
    }
    private void render() {
        if(dialog!=null) { dialog.setOnDismissListener(null); dialog.dismiss(); }
        final ChoicePrompt current=prompt;
        selected.clear();
        List<Row> rows=new ArrayList<>(); flatten(current.choices,rows,false,0);
        boolean multiple=current.type==ChoicePrompt.Type.MULTIPLE;
        ListView list=new ListView(activity);
        list.setChoiceMode(multiple?ListView.CHOICE_MODE_MULTIPLE:ListView.CHOICE_MODE_SINGLE);
        ArrayAdapter<Row> adapter=new ArrayAdapter<Row>(activity,multiple?android.R.layout.simple_list_item_multiple_choice:android.R.layout.simple_list_item_single_choice,rows) {
            @Override public boolean areAllItemsEnabled() { return false; }
            @Override public boolean isEnabled(int position) { return getItem(position).enabled; }
            @Override public View getView(int position,View convertView,ViewGroup parent) {
                View view=super.getView(position,convertView,parent);view.setEnabled(isEnabled(position));view.setAlpha(isEnabled(position)?1f:.45f);return view;
            }
        };
        list.setAdapter(adapter);
        for(int i=0;i<rows.size();i++) if(rows.get(i).choice.selected) list.setItemChecked(i,true);
        AlertDialog.Builder builder=new AlertDialog.Builder(activity).setView(list).setNegativeButton(android.R.string.cancel,(d,w)->dismiss());
        if(current.title!=null&&!current.title.isEmpty()) builder.setTitle(current.title);
        if(multiple) builder.setPositiveButton(android.R.string.ok,(d,w)->finish(true,null));
        dialog=builder.create();
        list.setOnItemClickListener((parent,view,position,id)->{
            Row row=rows.get(position);if(!row.enabled)return;
            if(multiple) { if(list.isItemChecked(position))selected.add(row.choice.id);else selected.remove(row.choice.id); }
            else finish(true,row.choice.id);
        });
        dialog.setOnDismissListener(d->{if(prompt==current)dismiss();});
        current.setDelegate(new PromptDelegate.PromptInstanceDelegate() {
            @Override public void onPromptDismiss(PromptDelegate.BasePrompt ignored) { if(prompt==current)dismiss(); }
            @Override public void onPromptUpdate(PromptDelegate.BasePrompt updated) {
                if(prompt==current&&updated instanceof ChoicePrompt) { prompt=(ChoicePrompt)updated;render(); }
            }
        });
        dialog.show();
    }
    private void flatten(ChoicePrompt.Choice[] choices,List<Row> rows,boolean parentDisabled,int depth) {
        if(choices==null)return;
        for(ChoicePrompt.Choice choice:choices) {
            boolean group=choice.items!=null;
            boolean disabled=parentDisabled||choice.disabled;
            rows.add(new Row(choice,(depth>0?"    ":"")+(choice.separator?"────────":choice.label==null?"":choice.label),!disabled&&!group&&!choice.separator));
            if(choice.selected&&!group&&!choice.separator)selected.add(choice.id);
            if(group)flatten(choice.items,rows,disabled,depth+1);
        }
    }
    boolean isShowing() { return dialog!=null&&dialog.isShowing(); }
    void dismiss() { finish(false,null); }
    private void finish(boolean confirm,String id) {
        ChoicePrompt current=prompt; GeckoResult<PromptDelegate.PromptResponse> result=response;
        prompt=null; response=null;
        if(dialog!=null) { dialog.setOnDismissListener(null);dialog.dismiss();dialog=null; }
        if(current==null||result==null)return;
        current.setDelegate(null);
        result.complete(current.isComplete()?null:!confirm?current.dismiss():current.type==ChoicePrompt.Type.MULTIPLE?current.confirm(selected.toArray(new String[0])):current.confirm(id));
        selected.clear();
    }
}
