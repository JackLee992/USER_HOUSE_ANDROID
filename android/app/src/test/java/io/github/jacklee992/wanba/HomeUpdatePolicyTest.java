package io.github.jacklee992.wanba;

import org.junit.Test;
import java.util.Collections;
import java.util.List;
import static org.junit.Assert.*;

public final class HomeUpdatePolicyTest {
    @Test public void mergeChecksWaitForBothResultsAndEligibleForegroundHome(){
        HomeUpdatePolicy p=new HomeUpdatePolicy(0,Collections.emptySet());assertTrue(p.begin(1_000_000,true,true));long token=p.run();
        assertFalse(p.begin(1_000_001,true,true));p.content(token,"signed-snapshot-a","1.4.0");assertTrue(p.pending(true).isEmpty());
        p.app(token,"8","1.4.0");assertFalse(p.checking());assertTrue(p.pending(false).isEmpty());assertEquals(2,p.pending(true).size());
        p.shown(p.pending(true));assertTrue(p.pending(true).isEmpty());assertFalse(p.begin(1_000_002,true,true));
        assertTrue(p.begin(1_180_000,true,true));long next=p.run();p.content(next,"signed-snapshot-a","1.4.0");p.app(next,"8","1.4.0");assertTrue(p.pending(true).isEmpty());
        HomeUpdatePolicy restored=new HomeUpdatePolicy(p.lastCheck(),p.shown());assertFalse(restored.begin(1_180_001,true,true));assertTrue(restored.begin(1_360_000,true,false));restored.content(restored.run(),"signed-snapshot-b","1.4.1");assertEquals(1,restored.pending(true).size());
    }
    @Test public void optionalModuleOfflineAndTimeoutAllFinishWithoutDuplicateLateCallbacks(){
        HomeUpdatePolicy p=new HomeUpdatePolicy(0,Collections.emptySet());assertFalse(p.begin(1_000_000,false,false));assertTrue(p.begin(1_000_000,true,false));
        p.content(p.run(),null,null);assertFalse(p.checking());assertTrue(p.pending(true).isEmpty());
        assertTrue(p.begin(1_180_000,true,true));long timedOut=p.run();p.app(timedOut,"8","1.4.0");p.timeout(timedOut);assertEquals(1,p.pending(true).size());
        p.content(timedOut,"late-snapshot","1.4.0");assertEquals(1,p.pending(true).size());
        p.shown(p.pending(true));assertTrue(p.begin(1_360_000,true,true));p.app(timedOut,"stale-version","9.0");assertTrue(p.checking());p.content(p.run(),null,null);p.app(p.run(),null,null);assertTrue(p.pending(true).isEmpty());
    }
    @Test public void contentInstalledElsewhereBeforePromptIsNotOfferedAgain(){
        HomeUpdatePolicy p=new HomeUpdatePolicy(0,Collections.emptySet());p.begin(1_000_000,true,false);p.content(p.run(),"candidate","1.4.0");assertEquals(1,p.pending(true).size());p.clearContentUnless(null);assertTrue(p.pending(true).isEmpty());
    }
    @Test public void noticeHistoryIsBoundedAndClockRollbackDoesNotDisableChecks(){
        HomeUpdatePolicy p=new HomeUpdatePolicy(9_000_000,Collections.emptySet());assertTrue(p.begin(1_000_000,true,false));
        for(int i=0;i<40;i++){if(i>0)assertTrue(p.begin(1_000_000L+i*HomeUpdatePolicy.INTERVAL_MS,true,false));p.content(p.run(),"snapshot-"+i,"1.0."+i);List<HomeUpdatePolicy.Update> items=p.pending(true);assertEquals(1,items.size());p.shown(items);}
        assertEquals(32,p.shown().size());
    }
}
